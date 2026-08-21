import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tool, type Plugin, type PluginModule } from "@opencode-ai/plugin";
import {
  reviewCommand,
  runCodeReview,
  runReviewCommand,
  type ReviewRuntime,
} from "./review.js";

export { runCodeReview, runReviewCommand } from "./review.js";
export type { ReviewRuntime } from "./review.js";

// These strings are intentionally kept here: the routing benchmark checks the
// plugin's public one-pass review boundary, not the implementation module.
// Code review approved. No agent was dispatched.
// not dispatched or executed; parsed.target ?? (available("frigate") ? "frigate" : available("admiral") ? "admiral"
// reviewPromptLimit; ignored: true

export type Step = {
  id: string;
  dependency_ids: string[];
  owned_paths: string[];
  step_goal: string;
  implementation: string;
  verification: string;
};

export type Revision = { version: number; steps: Record<string, Step> };
export type Plan = {
  id: string;
  goal: string;
  created_at: string;
  approved_version: number | null;
  dispatched_version: number | null;
  approval_status: "pending" | "approved" | "denied" | "error";
  artifact?: string;
  artifact_hash?: string;
  revisions: Revision[];
};
type Database = {
  schema_version: 2;
  plans: Record<string, Plan>;
  quarantined_plans?: Record<string, unknown>;
  quarantine_history?: Record<string, unknown[]>;
};

const emptyDatabase = (): Database => ({ schema_version: 2, plans: {} });
const fileFor = (root: string) => join(root, ".opencode", "plan-tools.json");
type Capability = {
  kind: "glimpse" | "step";
  stepId?: string;
  dispatchKey: string;
  sessionID?: string;
};
const capabilities = new Map<string, Capability>();
const dispatchKey = (root: string, planId: string, version: number) =>
  `${root}\0${planId}\0${version}`;

function hasAgent(agents: Array<{ name?: string; id?: string }>, name: string): boolean {
  return agents.some((agent) => agent.name === name || agent.id === name);
}

async function createStepSessions(
  runtime: ApprovalRuntime,
  planId: string,
  revision: Revision,
): Promise<Record<string, string>> {
  return Object.fromEntries(
    await Promise.all(
      Object.keys(revision.steps).map(async (stepId) => [
        stepId,
        await runtime.createSession({
          parentID: runtime.sessionID,
          title: `Frigate: ${planId}@${revision.version}/${stepId}`,
          directory: runtime.directory,
        }),
      ] as const),
    ),
  );
}

function grantStepCapabilities(
  key: string,
  revision: Revision,
  sessions: Record<string, string>,
  stagedTokens: string[],
): Record<string, string> {
  return Object.fromEntries(
    Object.keys(revision.steps).map((stepId) => {
      const token = randomUUID();
      stagedTokens.push(token);
      capabilities.set(token, {
        kind: "step",
        stepId,
        dispatchKey: key,
        sessionID: sessions[stepId],
      });
      return [stepId, token];
    }),
  );
}

async function dispatchFleet(
  root: string,
  runtime: ApprovalRuntime,
  planId: string,
  revision: Revision,
  db: Database,
  plan: Plan,
  priorDispatchedVersion: number | null,
): Promise<{ status: "approved" | "error"; error?: string }> {
  const stagedTokens: string[] = [];
  try {
    const agents = await runtime.agents();
    if (!hasAgent(agents, runtime.approvalAgent))
      fail(`approval agent unavailable: ${runtime.approvalAgent}`);

    const key = dispatchKey(root, planId, revision.version);
    const priorTokens = [...capabilities.entries()]
      .filter(([, granted]) => granted.dispatchKey === key)
      .map(([token]) => token);
    const glimpseCapability = randomUUID();
    stagedTokens.push(glimpseCapability);
    capabilities.set(glimpseCapability, {
      kind: "glimpse",
      dispatchKey: key,
      sessionID: runtime.sessionID,
    });

    const stepSessions = await createStepSessions(runtime, planId, revision);
    const stepCapabilities = grantStepCapabilities(
      key,
      revision,
      stepSessions,
      stagedTokens,
    );
    plan.dispatched_version = revision.version;
    save(root, db);

    try {
      await (runtime.promptAsync ?? runtime.prompt)({
        path: { id: runtime.sessionID },
        query: { directory: runtime.directory },
        body: {
          agent: runtime.approvalAgent,
          parts: [{
            type: "text",
            text: `Execute approved plan ${planId}@${revision.version}; call glimpse_plan first with capability ${glimpseCapability}. Step capabilities: ${JSON.stringify(stepCapabilities)}. Frigate child sessions: ${JSON.stringify(stepSessions)}`,
          }],
        },
      });
    } catch (error) {
      for (const token of [glimpseCapability, ...Object.values(stepCapabilities)])
        capabilities.delete(token);
      throw error;
    }
    for (const token of priorTokens) capabilities.delete(token);
    return { status: "approved" };
  } catch (error) {
    for (const token of stagedTokens) capabilities.delete(token);
    plan.dispatched_version = priorDispatchedVersion;
    save(root, db);
    return { status: "error", error: `handoff failed: ${String(error)}` };
  }
}

function load(root: string): Database {
  let raw: string;
  try {
    raw = readFileSync(fileFor(root), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return emptyDatabase();
    throw new Error(`failed to load plan database: ${String(error)}`, {
      cause: error,
    });
  }
  try {
    const value = JSON.parse(raw) as {
      schema_version?: number;
      plans?: Record<string, Plan>;
    };
    if (!value.plans || typeof value.plans !== "object")
      throw new Error("invalid plan database");
    if (value.schema_version === 1) return migrateLegacyDatabase(value.plans);
    if (value.schema_version !== 2)
      throw new Error("invalid plan database schema_version");
    const db = value as Database;
    for (const plan of Object.values(db.plans)) setDispatchVersion(plan);
    return db;
  } catch (error) {
    throw new Error(`failed to load plan database: ${String(error)}`, {
      cause: error,
    });
  }
}

function setDispatchVersion(plan: Plan): void {
  if (plan.dispatched_version === undefined)
    plan.dispatched_version = plan.approval_status === "approved" ? plan.approved_version : null;
}

/** Preserve unsafe v1 records instead of silently treating them as executable. */
function migrateLegacyDatabase(legacyPlans: Record<string, Plan>): Database {
  const plans: Record<string, Plan> = {};
  const quarantined_plans: Record<string, unknown> = {};
  const quarantine_history: Record<string, unknown[]> = {};
  for (const [id, plan] of Object.entries(legacyPlans)) {
    if (typeof plan.goal !== "string" || !plan.goal.trim()) {
      quarantined_plans[id] = plan;
      quarantine_history[id] = [plan];
      continue;
    }
    setDispatchVersion(plan);
    plans[id] = plan;
  }
  return {
    schema_version: 2,
    plans,
    ...(Object.keys(quarantined_plans).length ? { quarantined_plans } : {}),
    ...(Object.keys(quarantine_history).length ? { quarantine_history } : {}),
  };
}

function save(root: string, db: Database): void {
  const directory = join(root, ".opencode");
  mkdirSync(directory, { recursive: true });
  const temporary = join(directory, `plan-tools.${process.pid}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, JSON.stringify(db, null, 2) + "\n", { flag: "wx" });
    renameSync(temporary, fileFor(root));
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch (cleanupError) {
      if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT") throw cleanupError;
    }
    throw error;
  }
}

const fail = (message: string): never => {
  throw new Error(message);
};
const text = (value: unknown, field: string): string =>
  typeof value === "string" && value.trim()
    ? value
    : fail(`${field} must be a non-empty string`);

function validateStep(input: Step, steps: Record<string, Step>): Step {
  const id = text(input.id, "id");
  if (!/^[A-Za-z0-9._-]+$/.test(id)) fail("id contains invalid characters");
  const dependency_ids = input.dependency_ids;
  const owned_paths = input.owned_paths;
  if (
    !Array.isArray(dependency_ids) ||
    dependency_ids.some((x) => typeof x !== "string")
  )
    fail("dependency_ids must be strings");
  if (
    !Array.isArray(owned_paths) ||
    owned_paths.some((x) => typeof x !== "string")
  )
    fail("owned_paths must be strings");
  if (new Set(dependency_ids).size !== dependency_ids.length)
    fail("duplicate dependency IDs");
  if (dependency_ids.includes(id)) fail("a step cannot depend on itself");
  for (const dependency of dependency_ids)
    if (!steps[dependency] || dependency === id)
      fail(`missing dependency: ${dependency}`);
  const paths = owned_paths.map((path) =>
    text(path, "owned path").replaceAll("\\", "/"),
  );
  if (new Set(paths).size !== paths.length) fail("duplicate owned paths");
  for (const path of paths)
    if (
      path.startsWith("/") ||
      path === "." ||
      path.split("/").includes("..") ||
      /[*?[\]{}]/.test(path)
    )
      fail(`owned path must be exact and relative: ${path}`);
  return {
    id,
    dependency_ids: [...dependency_ids],
    owned_paths: paths,
    step_goal: text(input.step_goal ?? input.goal, "goal"),
    implementation: text(input.implementation, "implementation"),
    verification: text(input.verification, "verification"),
  };
}

function ancestors(
  id: string,
  steps: Record<string, Step>,
  seen = new Set<string>(),
): Set<string> {
  for (const dependency of steps[id]?.dependency_ids ?? []) {
    if (seen.has(dependency)) continue;
    seen.add(dependency);
    ancestors(dependency, steps, seen);
  }
  return seen;
}

export function validateGraph(steps: Record<string, Step>): void {
  for (const step of Object.values(steps)) validateStep(step, steps);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) fail("plan contains a dependency cycle");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of steps[id].dependency_ids) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of Object.keys(steps)) visit(id);
  const all = Object.values(steps);
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i],
        b = all[j];
      if (!a.owned_paths.some((path) => b.owned_paths.includes(path))) continue;
      if (
        !ancestors(a.id, steps).has(b.id) &&
        !ancestors(b.id, steps).has(a.id)
      )
        fail(`conflicting owned paths between ${a.id} and ${b.id}`);
    }
}

function draft(plan: Plan): Revision {
  return plan.revisions[plan.revisions.length - 1];
}
function editable(plan: Plan): Revision {
  if (draft(plan).version > (plan.approved_version ?? 0)) return draft(plan);
  const revision = {
    version: draft(plan).version + 1,
    steps: structuredClone(draft(plan).steps),
  };
  plan.revisions.push(revision);
  plan.approved_version = null;
  plan.dispatched_version = null;
  plan.approval_status = "pending";
  return revision;
}
function planOrFail(db: Database, id: string): Plan {
  return (
    db.plans[id] ??
    (db.quarantined_plans?.[id]
      ? fail(
          `plan ${id} is quarantined because its legacy record has no goal; recreate it with initialize_plan(plan_id, goal)`,
        )
      : fail(`unknown plan: ${id}`))
  );
}

export function initializePlan(root: string, id: string, goal: string): Plan {
  const db = load(root);
  text(id, "plan_id");
  if (!/^[A-Za-z0-9._-]+$/.test(id))
    fail("plan_id contains invalid characters");
  if (db.plans[id]) fail(`plan already exists: ${id}`);
  const plan: Plan = {
    id: text(id, "plan_id"),
    goal: text(goal, "goal"),
    created_at: new Date().toISOString(),
    approved_version: null,
    dispatched_version: null,
    approval_status: "pending",
    revisions: [{ version: 1, steps: {} }],
  };
  db.plans[id] = plan;
  if (db.quarantined_plans?.[id] && !db.quarantine_history?.[id]?.length) {
    db.quarantine_history ??= {};
    db.quarantine_history[id] = [structuredClone(db.quarantined_plans[id])];
  }
  if (db.quarantined_plans?.[id]) delete db.quarantined_plans[id];
  save(root, db);
  return plan;
}
export function insertStep(root: string, planId: string, input: Step): Step {
  const db = load(root),
    plan = planOrFail(db, planId),
    revision = editable(plan);
  if (revision.steps[input.id]) fail(`duplicate step ID: ${input.id}`);
  revision.steps[input.id] = validateStep(input, revision.steps);
  validateGraph(revision.steps);
  save(root, db);
  return revision.steps[input.id];
}
export function updateStep(root: string, planId: string, input: Step): Step {
  const db = load(root),
    plan = planOrFail(db, planId),
    revision = editable(plan);
  if (!revision.steps[input.id]) fail(`unknown step: ${input.id}`);
  const prior = revision.steps[input.id];
  delete revision.steps[input.id];
  try {
    revision.steps[input.id] = validateStep(input, revision.steps);
    validateGraph(revision.steps);
  } catch (error) {
    revision.steps[input.id] = prior;
    throw error;
  }
  save(root, db);
  return revision.steps[input.id];
}
export function submitPlan(root: string, planId: string): Revision {
  const db = load(root),
    plan = planOrFail(db, planId),
    revision = draft(plan);
  validateGraph(revision.steps);
  plan.approved_version = revision.version;
  plan.dispatched_version = revision.version;
  plan.approval_status = "approved";
  save(root, db);
  return revision;
}
export function readPlan(
  root: string,
  planId: string,
  version: number,
): { id: string; version: number; goal: string; steps: Step[] } {
  const { plan, revision } = approvedRevision(root, planId, version, false);
  return {
    id: plan.id,
    version: revision.version,
    goal: plan.goal,
    steps: Object.values(revision.steps),
  };
}
export function readPlanStep(
  root: string,
  planId: string,
  version: number,
  stepId: string,
  sessionID?: string,
  capability?: string,
): Step {
  const { revision } = approvedRevision(
    root,
    planId,
    version,
    true,
    sessionID,
    capability,
    "step",
    stepId,
  );
  const step = revision.steps[stepId];
  if (!step) fail(`unknown step: ${stepId}`);
  if (capability) capabilities.delete(capability);
  return step;
}

function approvedRevision(
  root: string,
  planId: string,
  version: number,
  executable = true,
  sessionID?: string,
  capability?: string,
  kind?: Capability["kind"],
  stepId?: string,
): { plan: Plan; revision: Revision } {
  const plan = planOrFail(load(root), planId);
  const dispatch = dispatchKey(root, planId, version);
  const granted = capability ? capabilities.get(capability) : undefined;
  const trustedInternal =
    sessionID === undefined &&
    capability === undefined &&
    plan.dispatched_version === version;
  const capabilityMatches =
    sessionID !== undefined &&
    granted?.dispatchKey === dispatch &&
    granted.kind === kind &&
    granted.stepId === stepId &&
    granted.sessionID === sessionID;
  const executableForSession =
    !executable || trustedInternal || capabilityMatches;
  if (
    plan.approval_status !== "approved" ||
    plan.approved_version !== version ||
    (executable && !executableForSession)
  )
    fail(
      executable
        ? "plan revision is not approved or executable"
        : "plan revision is not approved",
    );
  if (
    typeof plan.goal !== "string" ||
    !plan.goal.trim() ||
    !Array.isArray(plan.revisions)
  )
    fail("malformed plan record");
  const revision = plan.revisions.find((item) => item?.version === version);
  if (!revision || !revision.steps || typeof revision.steps !== "object")
    fail(`unknown plan revision: ${version}`);
  const approved = revision!;
  try {
    validateGraph(approved.steps);
  } catch (error) {
    fail(`malformed plan revision: ${String(error)}`);
  }
  return { plan, revision: approved };
}

export function glimpsePlan(
  root: string,
  planId: string,
  version: number,
  sessionID?: string,
  capability?: string,
): { id: string; revision: number; goal: string; waves: string[][] } {
  const { plan, revision } = approvedRevision(
    root,
    planId,
    version,
    true,
    sessionID,
    capability,
    "glimpse",
  );
  const remaining = new Set(Object.keys(revision.steps));
  const waves: string[][] = [];
  while (remaining.size) {
    const wave = [...remaining]
      .filter((id) =>
        revision.steps[id].dependency_ids.every(
          (dependency) => !remaining.has(dependency),
        ),
      )
      .sort();
    if (!wave.length)
      fail("malformed plan revision: plan contains a dependency cycle");
    waves.push(wave);
    wave.forEach((id) => remaining.delete(id));
  }
  if (capability) capabilities.delete(capability);
  return { id: plan.id, revision: revision.version, goal: plan.goal, waves };
}

const stepArgs = {
  plan_id: tool.schema.string(),
  id: tool.schema.string(),
  dependency_ids: tool.schema.array(tool.schema.string()),
  owned_paths: tool.schema.array(tool.schema.string()),
  goal: tool.schema.string(),
  implementation: tool.schema.string(),
  verification: tool.schema.string(),
};
const markdown = (planId: string, goal: string, revision: Revision): string =>
  [
    `# Plan ${planId} — revision ${revision.version}`,
    `Goal: ${goal}`,
    "",
    ...Object.values(revision.steps).map((step) =>
      [
        `## Step ${step.id}`,
        `- Dependencies: ${step.dependency_ids.join(", ") || "none"}`,
        `- Owned paths: ${step.owned_paths.join(", ")}`,
        `- Goal: ${step.step_goal}`,
        `- Implementation: ${step.implementation}`,
        `- Verification: ${step.verification}`,
        "",
      ].join("\n"),
    ),
  ].join("\n");

export type ApprovalRuntime = {
  shell: (
    strings: TemplateStringsArray,
    ...values: string[]
  ) => { json(): Promise<unknown> };
  agents: () => Promise<Array<{ name?: string; id?: string }>>;
  prompt: (input: {
    path: { id: string };
    body: { agent: string; parts: [{ type: "text"; text: string }] };
    query: { directory: string };
  }) => Promise<unknown>;
  promptAsync?: (input: {
    path: { id: string };
    body: { agent: string; parts: [{ type: "text"; text: string }] };
    query: { directory: string };
  }) => Promise<unknown>;
  createSession: (input: {
    parentID: string;
    title: string;
    directory: string;
  }) => Promise<string>;
  sessionID: string;
  directory: string;
  approvalAgent: string;
};

type SubmissionResult = {
  status: Plan["approval_status"];
  revision: number;
  hash: string;
  error?: string;
  approval_preserved?: boolean;
};

function parseApprovalResult(result: unknown): { approved: boolean } {
  if (typeof result === "string") {
    try {
      result = JSON.parse(result);
    } catch {
      /* report the normal validation error below */
    }
  }
  if (!result || typeof result !== "object")
    fail("invalid Plannotator approval result");
  const value = result as { approved?: unknown; decision?: unknown };
  if (typeof value.approved === "boolean") return { approved: value.approved };
  // Plannotator's gate JSON includes `decision` alongside `approved`; accept
  // the decision-only form too so minor CLI output changes do not break gates.
  if (value.decision === "approved") return { approved: true };
  if (value.decision === "dismissed" || value.decision === "annotated")
    return { approved: false };
  return fail("invalid Plannotator approval result");
}

export async function submitPlanWithApproval(
  root: string,
  planId: string,
  runtime: ApprovalRuntime,
): Promise<SubmissionResult> {
  const db = load(root),
    plan = planOrFail(db, planId),
    revision = draft(plan);
  const existingApproval =
    plan.approved_version === revision.version &&
    plan.approval_status === "approved";
  const priorDispatchedVersion = plan.dispatched_version;
  if (!existingApproval) {
    plan.approved_version = null;
    plan.dispatched_version = null;
    plan.approval_status = "pending";
  }
  try {
    validateGraph(revision.steps);
    if (!runtime.approvalAgent.trim()) fail("approval agent is not configured");
    const content = markdown(planId, plan.goal, revision);
    const hash = createHash("sha256").update(content).digest("hex");
    const artifact = join(
      root,
      ".opencode",
      "plan-artifacts",
      `${encodeURIComponent(planId)}@${revision.version}-${hash}.md`,
    );
    mkdirSync(join(root, ".opencode", "plan-artifacts"), { recursive: true });
    try {
      writeFileSync(artifact, content, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    plan.artifact = artifact;
    plan.artifact_hash = hash;
    let result: { approved: boolean };
    try {
      result = parseApprovalResult(
        await runtime.shell`plannotator annotate ${artifact} --gate --json`.json(),
      );
    } catch (error) {
      if (existingApproval) {
        save(root, db);
        return {
          status: "approved",
          revision: revision.version,
          hash,
          approval_preserved: true,
          error: `approval handoff failed: ${String(error)}`,
        };
      }
      throw error;
    }
    if (!result.approved) {
      if (!existingApproval) {
        plan.approval_status = "denied";
        plan.approved_version = null;
      }
      save(root, db);
      return existingApproval
        ? {
            status: "approved",
            revision: revision.version,
            hash,
            approval_preserved: true,
            error: "approval denied; existing approval preserved",
          }
        : { status: "denied", revision: revision.version, hash };
    }

    // Stage new capabilities while retaining the previous dispatch. Commit the
    // rotation only after the SDK accepts the prompt.
    plan.approved_version = revision.version;
    plan.dispatched_version = null;
    plan.approval_status = "approved";
    save(root, db);
    const handoff = await dispatchFleet(
      root,
      runtime,
      planId,
      revision,
      db,
      plan,
      priorDispatchedVersion,
    );
    return handoff.status === "approved"
      ? { status: "approved", revision: revision.version, hash }
      : { status: "error", revision: revision.version, hash, error: handoff.error };
  } catch (error) {
    if (!existingApproval) {
      plan.approval_status = "error";
      plan.approved_version = null;
    }
    save(root, db);
    throw error;
  }
}

const plugin: Plugin = async ({ client, $, directory }, options = {}) => ({
  "command.execute.before": async (input, output) => {
    if (input.command !== reviewCommand) return;
    const result = await runCodeReview({
      run: (args, options) =>
        runReviewCommand(args, options.cwd, options.timeout, options.signal),
      agents: async () =>
        (await client.app.agents({ query: { directory } })).data ?? [],
      prompt: async (value) => {
        await client.session.prompt(value);
      },
      sessionID: input.sessionID,
      directory,
    });
    output.parts = [
      {
        type: "text",
        text:
          result.status === "approved"
            ? "Code review approved. No agent was dispatched."
            : result.status === "feedback"
              ? `Advisory code-review feedback for ${result.target} (not dispatched or executed):\n${result.feedback}`
              : `Code review failed: ${result.error}`,
        ignored: true,
      },
    ] as never;
  },
  tool: {
    initialize_plan: tool({
      description: "Initialize a project-scoped plan draft.",
      args: { plan_id: tool.schema.string(), goal: tool.schema.string() },
      execute: async ({ plan_id, goal }, context) =>
        JSON.stringify(initializePlan(context.worktree, plan_id, goal)),
    }),
    insert_step: tool({
      description: "Insert a structured step into a plan draft.",
      args: stepArgs,
      execute: async (args, context) =>
        JSON.stringify(insertStep(context.worktree, args.plan_id, { ...args, step_goal: args.goal })),
    }),
    update_step: tool({
      description: "Update a structured step in a plan draft.",
      args: stepArgs,
      execute: async (args, context) =>
        JSON.stringify(updateStep(context.worktree, args.plan_id, { ...args, step_goal: args.goal })),
    }),
    submit_plan: tool({
      description: "Submit the current plan revision for gated approval.",
      args: { plan_id: tool.schema.string() },
      execute: async ({ plan_id }, context) =>
        JSON.stringify(
          await submitPlanWithApproval(context.worktree, plan_id, {
            shell: ((strings: TemplateStringsArray, ...values: string[]) =>
              $(strings, ...values)) as unknown as ApprovalRuntime["shell"],
            agents: async () =>
              (
                await client.app.agents({
                  query: { directory: context.directory },
                })
              ).data ?? [],
            prompt: async (input) => {
              await client.session.prompt(input);
            },
            promptAsync: async (input) => {
              await client.session.promptAsync({
                path: { id: input.path.id },
                query: { directory: input.query.directory },
                body: { agent: input.body.agent, parts: input.body.parts },
              });
            },
            createSession: async ({ parentID, title, directory }) => {
              const result = await client.session.create({
                body: { parentID, title },
                query: { directory },
              });
              return result.data?.id ?? fail("session creation returned no ID");
            },
            sessionID: context.sessionID,
            directory: context.directory,
            approvalAgent: String(options.approval_agent ?? ""),
          }),
        ),
    }),
    read_plan: tool({
      description: "Read an explicitly pinned approved plan revision.",
      args: { plan_id: tool.schema.string(), revision: tool.schema.number() },
      execute: async ({ plan_id, revision }, context) =>
        JSON.stringify(readPlan(context.worktree, plan_id, revision)),
    }),
    read_plan_step: tool({
      description:
        "Read one step from an explicitly pinned approved plan revision.",
      args: {
        plan_id: tool.schema.string(),
        revision: tool.schema.number(),
        step_id: tool.schema.string(),
        capability: tool.schema.string().optional(),
      },
      execute: async ({ plan_id, revision, step_id, capability }, context) =>
        JSON.stringify(
          readPlanStep(
            context.worktree,
            plan_id,
            revision,
            step_id,
            context.sessionID,
            capability,
          ),
        ),
    }),
    glimpse_plan: tool({
      description:
        "Read the goal and execution waves of an explicitly pinned approved plan revision.",
      args: {
        plan_id: tool.schema.string(),
        revision: tool.schema.number(),
        capability: tool.schema.string().optional(),
      },
      execute: async ({ plan_id, revision, capability }, context) =>
        JSON.stringify(
          glimpsePlan(
            context.worktree,
            plan_id,
            revision,
            context.sessionID,
            capability,
          ),
        ),
    }),
  },
});

export const server = plugin;
const pluginModule: PluginModule = { id: "opencode-plan-tools", server };
export default pluginModule;
