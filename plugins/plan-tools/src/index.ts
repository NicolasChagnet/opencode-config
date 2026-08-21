import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tool, type Plugin, type PluginModule } from "@opencode-ai/plugin";

export type Step = {
  id: string;
  dependency_ids: string[];
  owned_paths: string[];
  goal: string;
  implementation: string;
  verification: string;
};

export type Revision = { version: number; steps: Record<string, Step> };
export type Plan = { id: string; created_at: string; approved_version: number | null; approval_status: "pending" | "approved" | "denied" | "error"; artifact?: string; artifact_hash?: string; revisions: Revision[] };
type Database = { schema_version: 1; plans: Record<string, Plan> };

const emptyDatabase = (): Database => ({ schema_version: 1, plans: {} });
const fileFor = (root: string) => join(root, ".opencode", "plan-tools.json");

function load(root: string): Database {
  try {
    const value = JSON.parse(readFileSync(fileFor(root), "utf8")) as Database;
    if (value.schema_version !== 1 || !value.plans) throw new Error("invalid plan database");
    return value;
  } catch {
    return emptyDatabase();
  }
}

function save(root: string, db: Database): void {
  const directory = join(root, ".opencode");
  mkdirSync(directory, { recursive: true });
  const temporary = join(directory, `plan-tools.${process.pid}.tmp`);
  writeFileSync(temporary, JSON.stringify(db, null, 2) + "\n");
  renameSync(temporary, fileFor(root));
}

const fail = (message: string): never => { throw new Error(message); };
const text = (value: unknown, field: string): string =>
  typeof value === "string" && value.trim() ? value : fail(`${field} must be a non-empty string`);

function validateStep(input: Step, steps: Record<string, Step>): Step {
  const id = text(input.id, "id");
  if (!/^[A-Za-z0-9._-]+$/.test(id)) fail("id contains invalid characters");
  const dependency_ids = input.dependency_ids;
  const owned_paths = input.owned_paths;
  if (!Array.isArray(dependency_ids) || dependency_ids.some((x) => typeof x !== "string")) fail("dependency_ids must be strings");
  if (!Array.isArray(owned_paths) || owned_paths.some((x) => typeof x !== "string")) fail("owned_paths must be strings");
  if (new Set(dependency_ids).size !== dependency_ids.length) fail("duplicate dependency IDs");
  if (dependency_ids.includes(id)) fail("a step cannot depend on itself");
  for (const dependency of dependency_ids) if (!steps[dependency] || dependency === id) fail(`missing dependency: ${dependency}`);
  const paths = owned_paths.map((path) => text(path, "owned path").replaceAll("\\", "/"));
  if (new Set(paths).size !== paths.length) fail("duplicate owned paths");
  for (const path of paths) if (path.startsWith("/") || path === "." || path.split("/").includes("..") || /[*?[\]{}]/.test(path)) fail(`owned path must be exact and relative: ${path}`);
  return { id, dependency_ids: [...dependency_ids], owned_paths: paths, goal: text(input.goal, "goal"), implementation: text(input.implementation, "implementation"), verification: text(input.verification, "verification") };
}

function ancestors(id: string, steps: Record<string, Step>, seen = new Set<string>()): Set<string> {
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
    visiting.delete(id); visited.add(id);
  };
  for (const id of Object.keys(steps)) visit(id);
  const all = Object.values(steps);
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    if (!a.owned_paths.some((path) => b.owned_paths.includes(path))) continue;
    if (!ancestors(a.id, steps).has(b.id) && !ancestors(b.id, steps).has(a.id)) fail(`conflicting owned paths between ${a.id} and ${b.id}`);
  }
}

function draft(plan: Plan): Revision {
  return plan.revisions[plan.revisions.length - 1];
}
function editable(plan: Plan): Revision {
  if (draft(plan).version > (plan.approved_version ?? 0)) return draft(plan);
  const revision = { version: draft(plan).version + 1, steps: structuredClone(draft(plan).steps) };
  plan.revisions.push(revision);
  return revision;
}
function planOrFail(db: Database, id: string): Plan { return db.plans[id] ?? fail(`unknown plan: ${id}`); }

export function initializePlan(root: string, id: string): Plan {
  const db = load(root);
  if (db.plans[id]) fail(`plan already exists: ${id}`);
  const plan: Plan = { id: text(id, "plan_id"), created_at: new Date().toISOString(), approved_version: null, approval_status: "pending", revisions: [{ version: 1, steps: {} }] };
  db.plans[id] = plan; save(root, db); return plan;
}
export function insertStep(root: string, planId: string, input: Step): Step {
  const db = load(root), plan = planOrFail(db, planId), revision = editable(plan);
  if (revision.steps[input.id]) fail(`duplicate step ID: ${input.id}`);
  revision.steps[input.id] = validateStep(input, revision.steps); validateGraph(revision.steps); save(root, db); return revision.steps[input.id];
}
export function updateStep(root: string, planId: string, input: Step): Step {
  const db = load(root), plan = planOrFail(db, planId), revision = editable(plan);
  if (!revision.steps[input.id]) fail(`unknown step: ${input.id}`);
  const prior = revision.steps[input.id]; delete revision.steps[input.id];
  try { revision.steps[input.id] = validateStep(input, revision.steps); validateGraph(revision.steps); } catch (error) { revision.steps[input.id] = prior; throw error; }
  save(root, db); return revision.steps[input.id];
}
export function submitPlan(root: string, planId: string): Revision {
  const db = load(root), plan = planOrFail(db, planId), revision = draft(plan);
  validateGraph(revision.steps); plan.approved_version = revision.version; plan.approval_status = "approved"; save(root, db); return revision;
}
export function readPlan(root: string, planId: string): { id: string; version: number; steps: Step[] } {
  const plan = planOrFail(load(root), planId); if (plan.approved_version === null) fail("plan has no approved revision");
  const revision = plan.revisions.find((item) => item.version === plan.approved_version)!;
  return { id: plan.id, version: revision.version, steps: Object.values(revision.steps) };
}
export function readPlanStep(root: string, planId: string, stepId: string): Step {
  const plan = planOrFail(load(root), planId); if (plan.approved_version === null) fail("plan has no approved revision");
  const step = plan.revisions.find((item) => item.version === plan.approved_version)!.steps[stepId];
  return step ?? fail(`unknown step: ${stepId}`);
}

const stepArgs = {
  plan_id: tool.schema.string(), id: tool.schema.string(), dependency_ids: tool.schema.array(tool.schema.string()), owned_paths: tool.schema.array(tool.schema.string()), goal: tool.schema.string(), implementation: tool.schema.string(), verification: tool.schema.string(),
};
const markdown = (planId: string, revision: Revision): string => [
  `# Plan ${planId} — revision ${revision.version}`,
  "",
  ...Object.values(revision.steps).map((step) => [
    `## ${step.id}`,
    `- Dependencies: ${step.dependency_ids.join(", ") || "none"}`,
    `- Owned paths: ${step.owned_paths.join(", ")}`,
    `- Goal: ${step.goal}`,
    `- Implementation: ${step.implementation}`,
    `- Verification: ${step.verification}`,
    "",
  ].join("\n")),
].join("\n");

export type ApprovalRuntime = {
  shell: (strings: TemplateStringsArray, ...values: string[]) => { json(): Promise<{ approved?: boolean }> };
  agents: () => Promise<Array<{ name?: string; id?: string }>>;
  prompt: (input: { path: { id: string }; body: { agent: string; parts: [{ type: "text"; text: string }] }; query: { directory: string } }) => Promise<unknown>;
  sessionID: string;
  directory: string;
  approvalAgent: string;
};

export async function submitPlanWithApproval(root: string, planId: string, runtime: ApprovalRuntime): Promise<{ status: Plan["approval_status"]; revision: number; hash: string }> {
  const db = load(root), plan = planOrFail(db, planId), revision = draft(plan);
  validateGraph(revision.steps);
  if (!runtime.approvalAgent.trim()) { plan.approval_status = "error"; save(root, db); fail("approval agent is not configured"); }
  const content = markdown(planId, revision);
  const hash = createHash("sha256").update(content).digest("hex");
  const artifact = join(root, ".opencode", "plan-artifacts", `${planId}@${revision.version}-${hash}.md`);
  mkdirSync(join(root, ".opencode", "plan-artifacts"), { recursive: true });
  writeFileSync(artifact, content, { flag: "wx" });
  plan.artifact = artifact; plan.artifact_hash = hash;
  try {
    const result = await runtime.shell`plannotator annotate ${artifact} --gate --json`.json();
    if (!result.approved) { plan.approval_status = "denied"; save(root, db); return { status: "denied", revision: revision.version, hash }; }
    const agents = await runtime.agents();
    if (!agents.some((agent) => agent.name === runtime.approvalAgent || agent.id === runtime.approvalAgent)) fail(`approval agent unavailable: ${runtime.approvalAgent}`);
    await runtime.prompt({ path: { id: runtime.sessionID }, query: { directory: runtime.directory }, body: { agent: runtime.approvalAgent, parts: [{ type: "text", text: `Execute approved plan ${planId}@${revision.version}; call read_plan first.` }] } });
    plan.approved_version = revision.version; plan.approval_status = "approved"; save(root, db);
    return { status: "approved", revision: revision.version, hash };
  } catch (error) {
    plan.approval_status = "error"; plan.approved_version = null; save(root, db); throw error;
  }
}

const plugin: Plugin = async ({ client, $ }, options = {}) => ({ tool: {
  initialize_plan: tool({ description: "Initialize a project-scoped plan draft.", args: { plan_id: tool.schema.string() }, execute: async ({ plan_id }, context) => JSON.stringify(initializePlan(context.worktree, plan_id)) }),
  insert_step: tool({ description: "Insert a structured step into a plan draft.", args: stepArgs, execute: async (args, context) => JSON.stringify(insertStep(context.worktree, args.plan_id, args)) }),
  update_step: tool({ description: "Update a structured step in a plan draft.", args: stepArgs, execute: async (args, context) => JSON.stringify(updateStep(context.worktree, args.plan_id, args)) }),
  submit_plan: tool({ description: "Submit the current plan revision for gated approval.", args: { plan_id: tool.schema.string() }, execute: async ({ plan_id }, context) => JSON.stringify(await submitPlanWithApproval(context.worktree, plan_id, {
    shell: ((strings: TemplateStringsArray, ...values: string[]) => $(strings, ...values)) as unknown as ApprovalRuntime["shell"],
    agents: async () => (await client.app.agents({ query: { directory: context.directory } })).data ?? [],
    prompt: async (input) => { await client.session.prompt(input); },
    sessionID: context.sessionID, directory: context.directory, approvalAgent: String(options.approval_agent ?? ""),
  })) }),
  read_plan: tool({ description: "Read the approved plan revision.", args: { plan_id: tool.schema.string() }, execute: async ({ plan_id }, context) => JSON.stringify(readPlan(context.worktree, plan_id)) }),
  read_plan_step: tool({ description: "Read one step from the approved plan.", args: { plan_id: tool.schema.string(), step_id: tool.schema.string() }, execute: async ({ plan_id, step_id }, context) => JSON.stringify(readPlanStep(context.worktree, plan_id, step_id)) }),
} });

export const server = plugin;
const pluginModule: PluginModule = { id: "opencode-plan-tools", server };
export default pluginModule;
