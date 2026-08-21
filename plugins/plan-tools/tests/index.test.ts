import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jest } from "@jest/globals";
jest.mock("@opencode-ai/plugin", () => ({
  tool: Object.assign((input: unknown) => input, { schema: require("zod") }),
}), { virtual: true });
import { glimpsePlan, initializePlan, insertStep, readPlan, readPlanStep, runCodeReview, server, submitPlan, submitPlanWithApproval, updateStep, type ApprovalRuntime, type ReviewRuntime } from "../src/index.js";

const step = (id: string, dependency_ids: string[] = [], owned_paths = [`${id}.ts`]) => ({ id, dependency_ids, owned_paths, step_goal: `goal ${id}`, implementation: `implementation ${id}`, verification: `verify ${id}` });

describe("plan tools", () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "plan-tools-")); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  test("stores project-scoped drafts and reads only approved revisions", () => {
    expect(initializePlan(root, "demo", "ship the demo").goal).toBe("ship the demo");
    insertStep(root, "demo", step("one"));
    expect(() => readPlan(root, "demo", 1)).toThrow("not approved");
    submitPlan(root, "demo");
    updateStep(root, "demo", step("one", [], ["changed.ts"]));
    expect(() => readPlanStep(root, "demo", 1, "one")).toThrow("not approved");
    expect(() => readPlan(root, "demo", 1)).toThrow("not approved");
  });

  test("returns only deterministic waves for an approved revision", () => {
    initializePlan(root, "demo", "ship the demo");
    insertStep(root, "demo", step("z"));
    insertStep(root, "demo", step("a"));
    insertStep(root, "demo", step("m", ["a", "z"]));
    expect(() => glimpsePlan(root, "demo", 1)).toThrow("not approved");
    submitPlan(root, "demo");
    expect(glimpsePlan(root, "demo", 1)).toEqual({ id: "demo", revision: 1, goal: "ship the demo", waves: [["a", "z"], ["m"]] });
    expect(Object.keys(glimpsePlan(root, "demo", 1))).toEqual(["id", "revision", "goal", "waves"]);
  });

  test("rejects empty plan goals", () => {
    expect(() => initializePlan(root, "demo", " ")).toThrow("goal must be a non-empty string");
  });

  test("rejects missing dependencies, cycles, and independent path conflicts", () => {
    initializePlan(root, "demo", "ship the demo");
    expect(() => insertStep(root, "demo", step("a", ["missing"]))).toThrow("missing dependency");
    insertStep(root, "demo", step("a", [], ["same.ts"]));
    expect(() => insertStep(root, "demo", step("b", [], ["same.ts"]))).toThrow("conflicting owned paths");
  });

  test("permits shared paths when dependency order is explicit and detects cycles", () => {
    initializePlan(root, "demo", "ship the demo");
    insertStep(root, "demo", step("a", [], ["same.ts"]));
    insertStep(root, "demo", step("b", ["a"], ["same.ts"]));
    expect(() => updateStep(root, "demo", step("a", ["b"], ["same.ts"]))).toThrow("cycle");
    submitPlan(root, "demo");
    expect(readPlan(root, "demo", 1).steps).toHaveLength(2);
  });

  const runtime = (approved: boolean, agent = "fleet", prompt: ApprovalRuntime["prompt"] = async () => undefined): ApprovalRuntime => ({
    shell: jest.fn(() => ({ json: async () => ({ approved }) })) as never,
    createSession: async ({ title }) => title,
    agents: async () => [{ name: agent }], prompt, sessionID: "session-1", directory: root, approvalAgent: agent,
  });

  const reviewRuntime = (result: unknown, agent = "frigate", prompt: ReviewRuntime["prompt"] = async () => undefined): ReviewRuntime => ({
    run: jest.fn(async () => ({ stdout: JSON.stringify(result), stderr: "", exitCode: 0 })), agents: async () => [{ name: agent }], prompt, sessionID: "session-1", directory: root,
  });

  test("approves review without dispatching an agent", async () => {
    const prompt = jest.fn() as ReviewRuntime["prompt"];
    expect(await runCodeReview(reviewRuntime({ approved: true }, "frigate", prompt))).toEqual({ status: "approved" });
    expect(prompt).not.toHaveBeenCalled();
  });

  test.each(["frigate", "admiral"])("returns feedback targeted to %s without dispatching", async (target) => {
    const prompt = jest.fn(async () => undefined) as ReviewRuntime["prompt"];
    expect(await runCodeReview(reviewRuntime({ approved: false, target, feedback: "fix this" }, target, prompt))).toMatchObject({ status: "feedback", target });
    expect(prompt).not.toHaveBeenCalled();
  });

  test("bounds untrusted review feedback and marks truncation", async () => {
    const result = await runCodeReview(reviewRuntime({ approved: false, target: "frigate", feedback: "x".repeat(9_000) }));
    expect(result).toMatchObject({ status: "feedback", target: "frigate" });
    expect(result.feedback).toHaveLength(8_000);
    expect(result.feedback).toMatch(/\[feedback truncated\]$/);
  });

  test("marks the intercepted code-review command output as ignored", async () => {
    const plugin = await server({ client: { app: { agents: async () => ({ data: [{ name: "frigate" }] }) } }, directory: root } as never, {});
    const output = { parts: [] as unknown[] };
    await plugin["command.execute.before"]!({ command: "__opencode_plan_tools_code_review__", sessionID: "session-1", arguments: "" }, output as never);
    expect(output.parts).toEqual([expect.objectContaining({ ignored: true })]);
  });

  test("falls back to Frigate, then Admiral, without auto-dispatch", async () => {
    const prompt = jest.fn(async () => undefined) as ReviewRuntime["prompt"];
    expect(await runCodeReview({ ...reviewRuntime({ approved: false, feedback: "fix this" }, "admiral", prompt), agents: async () => [{ name: "frigate" }, { name: "admiral" }] })).toMatchObject({ status: "feedback", target: "frigate" });
    expect(await runCodeReview({ ...reviewRuntime({ approved: false, feedback: "fix this" }, "admiral", prompt), agents: async () => [{ name: "admiral" }] })).toMatchObject({ status: "feedback", target: "admiral" });
    expect(prompt).not.toHaveBeenCalled();
  });

  test("rejects invalid targets and malformed output", async () => {
    expect(await runCodeReview(reviewRuntime({ approved: false, target: "jack", feedback: "run it" }))).toMatchObject({ status: "error", error: expect.stringContaining("invalid") });
    expect(await runCodeReview(reviewRuntime({ approved: "yes" }))).toMatchObject({ status: "error", error: expect.stringContaining("invalid Plannotator review result") });
  });

  test("reports failures and keeps arguments injection-safe", async () => {
    const run = jest.fn(async (args: string[], options: { cwd: string }) => { expect(args).toEqual(["review", "--json"]); expect(options.cwd).toBe(root); return { stdout: "", stderr: "nope", exitCode: 2 }; });
    expect(await runCodeReview({ ...reviewRuntime({ approved: true }), run })).toMatchObject({ status: "error", error: "nope" });
  });

  test("persists approval, immutable artifact hash, and the handoff prompt", async () => {
    initializePlan(root, "demo", "ship the demo"); insertStep(root, "demo", step("one"));
    const prompt = jest.fn(async () => undefined) as ApprovalRuntime["prompt"];
    const result = await submitPlanWithApproval(root, "demo", runtime(true, "fleet", prompt));
    expect(result.status).toBe("approved");
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
     expect(prompt).toHaveBeenCalledWith(expect.objectContaining({
         path: { id: "session-1" }, body: { agent: "fleet", parts: [{ type: "text", text: expect.stringMatching(/^Execute approved plan demo@1; call glimpse_plan first with capability [a-f0-9-]+\. Step capabilities: /) }] },
     }));
    const db = JSON.parse(readFileSync(join(root, ".opencode", "plan-tools.json"), "utf8"));
    expect(db.plans.demo.approval_status).toBe("approved");
    expect(db.plans.demo.artifact_hash).toBe(result.hash);
     expect(readFileSync(db.plans.demo.artifact, "utf8")).toContain("# Plan demo — revision 1\nGoal: ship the demo");
     expect(readPlan(root, "demo", 1).goal).toBe("ship the demo");
   });

  test("keeps Fleet and Frigate capabilities valid after a successful handoff", async () => {
    initializePlan(root, "demo", "ship the demo"); insertStep(root, "demo", step("one"));
    let glimpseCapability = "";
    let stepCapability = "";
    const result = await submitPlanWithApproval(root, "demo", {
      ...runtime(true),
      prompt: async (input) => {
        const text = input.body.parts[0].text;
        glimpseCapability = text.match(/capability ([a-f0-9-]+)\./)?.[1] ?? "";
        stepCapability = JSON.parse(text.match(/Step capabilities: (\{.*?\})\. Frigate child sessions:/)?.[1] ?? "{}").one;
      },
    });
    expect(result.status).toBe("approved");
    expect(glimpsePlan(root, "demo", 1, "session-1", glimpseCapability)).toEqual(expect.objectContaining({ revision: 1 }));
    expect(readPlanStep(root, "demo", 1, "one", "Frigate: demo@1/one", stepCapability)).toEqual(step("one"));
    expect(() => readPlanStep(root, "demo", 1, "one", "Frigate: demo@1/one", stepCapability)).toThrow("not approved or executable");
  });

  test("uses async handoff so Admiral can finish its turn", async () => {
    initializePlan(root, "demo", "ship the demo"); insertStep(root, "demo", step("one"));
    const prompt = jest.fn(async () => undefined) as ApprovalRuntime["prompt"];
    const promptAsync = jest.fn(async () => undefined) as ApprovalRuntime["promptAsync"];
    await submitPlanWithApproval(root, "demo", {
      ...runtime(true, "fleet", prompt),
      promptAsync,
    });
    expect(promptAsync).toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
  });

  test.each(["{\"approved\":true}", { decision: "approved" }])("accepts Plannotator gate output %p", async (gateResult) => {
    initializePlan(root, "demo", "ship the demo"); insertStep(root, "demo", step("one"));
    const result = await submitPlanWithApproval(root, "demo", {
      ...runtime(true),
      shell: jest.fn(() => ({ json: async () => gateResult })) as never,
    });
    expect(result.status).toBe("approved");
  });

  test("binds each step capability to the authorized Frigate child session", async () => {
    initializePlan(root, "demo", "ship the demo"); insertStep(root, "demo", step("one"));
    let stepCapability = "";
    await submitPlanWithApproval(root, "demo", {
      ...runtime(true),
      prompt: async (input) => {
        stepCapability = JSON.parse(input.body.parts[0].text.match(/Step capabilities: (\{.*?\})\. Frigate child sessions:/)?.[1] ?? "{}").one;
      },
    });
    expect(() => readPlanStep(root, "demo", 1, "one", "frigate-child", stepCapability)).toThrow("not approved or executable");
    expect(readPlanStep(root, "demo", 1, "one", "Frigate: demo@1/one", stepCapability)).toEqual(step("one"));
  });

  test("persists denial and keeps the plan non-executable", async () => {
    initializePlan(root, "demo", "ship the demo"); insertStep(root, "demo", step("one"));
    const result = await submitPlanWithApproval(root, "demo", runtime(false));
    expect(result.status).toBe("denied");
    expect(() => readPlan(root, "demo", 1)).toThrow("not approved");
  });

  test("keeps newly approved revisions non-executable when handoff fails, then dispatches on retry", async () => {
    initializePlan(root, "demo", "ship the demo"); insertStep(root, "demo", step("one"));
    const result = await submitPlanWithApproval(root, "demo", {
      ...runtime(true),
      prompt: async () => { throw new Error("Fleet unavailable"); },
    });
    expect(result).toMatchObject({ status: "error", revision: 1, error: "handoff failed: Error: Fleet unavailable" });
    expect(readPlan(root, "demo", 1).steps).toHaveLength(1);
    expect(() => glimpsePlan(root, "demo", 1)).toThrow("not approved or executable");
    const db = JSON.parse(readFileSync(join(root, ".opencode", "plan-tools.json"), "utf8"));
    expect(db.plans.demo.approval_status).toBe("approved");
    expect(db.plans.demo.approved_version).toBe(1);
    expect(db.plans.demo.dispatched_version).toBeNull();

    const retryFailure = await submitPlanWithApproval(root, "demo", {
      ...runtime(true),
      prompt: async () => { throw new Error("Fleet still unavailable"); },
    });
    expect(retryFailure.status).toBe("error");
    expect(readPlan(root, "demo", 1).steps).toHaveLength(1);
    expect(() => glimpsePlan(root, "demo", 1)).toThrow("not approved or executable");
    expect(JSON.parse(readFileSync(join(root, ".opencode", "plan-tools.json"), "utf8")).plans.demo.dispatched_version).toBeNull();

    const retry = await submitPlanWithApproval(root, "demo", runtime(true));
    expect(retry).toMatchObject({ status: "approved", revision: 1 });
    expect(readPlan(root, "demo", 1).steps).toHaveLength(1);
    expect(JSON.parse(readFileSync(join(root, ".opencode", "plan-tools.json"), "utf8")).plans.demo.dispatched_version).toBe(1);
  });

  test("allows only the originating Fleet handoff capability to glimpse pending access", async () => {
    initializePlan(root, "demo", "ship the demo"); insertStep(root, "demo", step("one"));
    let capability = "";
    const glimpseDuringHandoff = jest.fn(() => glimpsePlan(root, "demo", 1, "session-1", capability));
    const result = await submitPlanWithApproval(root, "demo", {
       ...runtime(true),
       prompt: async (input) => { capability = input.body.parts[0].text.match(/capability ([a-f0-9-]+)\./)?.[1] ?? ""; const scoped = JSON.parse(input.body.parts[0].text.match(/Step capabilities: (\{.*?\})\. Frigate child sessions:/)?.[1] ?? "{}"); expect(glimpseDuringHandoff()).toEqual(expect.objectContaining({ revision: 1 })); expect(() => readPlanStep(root, "demo", 1, "one", "session-1", scoped.one)).toThrow("not approved or executable"); expect(() => glimpsePlan(root, "demo", 1, "one", capability)).toThrow("not approved or executable"); throw new Error("Fleet unavailable"); },
    });
    expect(result.status).toBe("error");
    expect(() => glimpsePlan(root, "demo", 1, "session-1")).toThrow("not approved or executable");
    expect(() => glimpsePlan(root, "demo", 1, "other-session")).toThrow("not approved or executable");
  });

  test("revokes handoff capabilities when dispatch fails", async () => {
    initializePlan(root, "demo", "ship the demo"); insertStep(root, "demo", step("one"));
    let glimpseCapability = "";
    let stepCapability = "";
    const result = await submitPlanWithApproval(root, "demo", {
      ...runtime(true),
      prompt: async (input) => {
        const text = input.body.parts[0].text;
        glimpseCapability = text.match(/capability ([a-f0-9-]+)\./)?.[1] ?? "";
        stepCapability = JSON.parse(text.match(/Step capabilities: (\{.*?\})\. Frigate child sessions:/)?.[1] ?? "{}").one;
        throw new Error("Fleet unavailable");
      },
    });
    expect(result.status).toBe("error");
    expect(() => glimpsePlan(root, "demo", 1, "session-1", glimpseCapability)).toThrow("not approved or executable");
    expect(() => readPlanStep(root, "demo", 1, "one", "session-1", stepCapability)).toThrow("not approved or executable");
  });

  test("revokes prior capabilities before a successful redispatch", async () => {
    initializePlan(root, "demo", "ship the demo"); insertStep(root, "demo", step("one"));
    let oldCapability = "";
    await submitPlanWithApproval(root, "demo", { ...runtime(true), prompt: async (input) => {
      oldCapability = input.body.parts[0].text.match(/capability ([a-f0-9-]+)\./)?.[1] ?? "";
    } });
    let freshCapability = "";
    await submitPlanWithApproval(root, "demo", { ...runtime(true), prompt: async (input) => {
      freshCapability = input.body.parts[0].text.match(/capability ([a-f0-9-]+)\./)?.[1] ?? "";
    } });
    expect(() => glimpsePlan(root, "demo", 1, "session-1", oldCapability)).toThrow("not approved or executable");
    expect(glimpsePlan(root, "demo", 1, "session-1", freshCapability)).toEqual(expect.objectContaining({ revision: 1 }));
  });

  test("preserves prior capabilities when redispatch fails", async () => {
    initializePlan(root, "demo", "ship the demo"); insertStep(root, "demo", step("one"));
    let oldCapability = "";
    await submitPlanWithApproval(root, "demo", { ...runtime(true), prompt: async (input) => {
      oldCapability = input.body.parts[0].text.match(/capability ([a-f0-9-]+)\./)?.[1] ?? "";
    } });
    const result = await submitPlanWithApproval(root, "demo", {
      ...runtime(true),
      prompt: async () => { throw new Error("Fleet unavailable"); },
    });
    expect(result.status).toBe("error");
    expect(glimpsePlan(root, "demo", 1, "session-1", oldCapability)).toEqual(expect.objectContaining({ revision: 1 }));
    expect(JSON.parse(readFileSync(join(root, ".opencode", "plan-tools.json"), "utf8")).plans.demo.dispatched_version).toBe(1);
  });

  test("preserves approval when resubmitting the unchanged approved revision is denied", async () => {
    initializePlan(root, "demo", "ship the demo"); insertStep(root, "demo", step("one"));
    await submitPlanWithApproval(root, "demo", runtime(true));

    const result = await submitPlanWithApproval(root, "demo", runtime(false));
    expect(result).toMatchObject({ status: "approved", revision: 1, approval_preserved: true, error: "approval denied; existing approval preserved" });
    const db = JSON.parse(readFileSync(join(root, ".opencode", "plan-tools.json"), "utf8"));
    expect(db.plans.demo.approval_status).toBe("approved");
    expect(db.plans.demo.approved_version).toBe(1);
    expect(readPlan(root, "demo", 1).steps).toHaveLength(1);
  });

  test("preserves approval when resubmitting the unchanged approved revision errors", async () => {
    initializePlan(root, "demo", "ship the demo"); insertStep(root, "demo", step("one"));
    await submitPlanWithApproval(root, "demo", runtime(true));
    const failingRuntime = { ...runtime(true), shell: jest.fn(() => ({ json: async () => { throw new Error("annotator unavailable"); } })) as never };

    const result = await submitPlanWithApproval(root, "demo", failingRuntime);
    expect(result).toMatchObject({ status: "approved", revision: 1, approval_preserved: true, error: "approval handoff failed: Error: annotator unavailable" });
    const db = JSON.parse(readFileSync(join(root, ".opencode", "plan-tools.json"), "utf8"));
    expect(db.plans.demo.approval_status).toBe("approved");
    expect(db.plans.demo.approved_version).toBe(1);
  });

  test("treats malformed Plannotator results as errors, not denials", async () => {
    initializePlan(root, "demo", "ship the demo"); insertStep(root, "demo", step("one"));
    const malformed = { ...runtime(false), shell: jest.fn(() => ({ json: async () => ({}) })) as never };
    await expect(submitPlanWithApproval(root, "demo", malformed)).rejects.toThrow("invalid Plannotator approval result");
    expect(() => readPlan(root, "demo", 1)).toThrow("not approved");
    const db = JSON.parse(readFileSync(join(root, ".opencode", "plan-tools.json"), "utf8"));
    expect(db.plans.demo.approval_status).toBe("error");
    expect(db.plans.demo.approved_version).toBeNull();
  });

  test("returns a recoverable error when the approval agent is unavailable", async () => {
    initializePlan(root, "demo", "ship the demo"); insertStep(root, "demo", step("one"));
    const result = await submitPlanWithApproval(root, "demo", { ...runtime(true), agents: async () => [{ name: "other" }] });
    expect(result.status).toBe("error");
    expect(readPlan(root, "demo", 1).goal).toBe("ship the demo");
    expect(() => glimpsePlan(root, "demo", 1)).toThrow("not approved or executable");
  });

  test("leaves the plan non-executable when approval config is missing", async () => {
    initializePlan(root, "demo", "ship the demo"); insertStep(root, "demo", step("one"));
    await expect(submitPlanWithApproval(root, "demo", { ...runtime(true), approvalAgent: "" })).rejects.toThrow("approval agent is not configured");
    expect(() => readPlan(root, "demo", 1)).toThrow("not approved");
  });

  test("invalidates approval after editing and requires the pinned revision", () => {
    initializePlan(root, "demo", "ship the demo"); insertStep(root, "demo", step("one")); submitPlan(root, "demo");
    updateStep(root, "demo", step("one", [], ["changed.ts"]));
    expect(() => readPlan(root, "demo", 1)).toThrow("not approved");
    expect(() => readPlanStep(root, "demo", 1, "one")).toThrow("not approved");
    submitPlan(root, "demo");
     expect(readPlan(root, "demo", 2).steps.find((item) => item.id === "one")?.owned_paths).toEqual(["changed.ts"]);
    expect(() => readPlan(root, "demo", 1)).toThrow("not approved");
  });

  test("rejects hostile plan IDs and exposes corrupt storage", () => {
    expect(() => initializePlan(root, "../escape", "ship the demo")).toThrow("invalid characters");
    initializePlan(root, "demo", "ship the demo");
    const database = join(root, ".opencode", "plan-tools.json");
    writeFileSync(database, "not json");
    expect(() => readPlan(root, "demo", 1)).toThrow("failed to load plan database");
  });

  test("quarantines schema 1 records without a goal and permits deliberate recovery", () => {
    mkdirSync(join(root, ".opencode"));
    writeFileSync(join(root, ".opencode", "plan-tools.json"), JSON.stringify({ schema_version: 1, plans: {
      demo: { id: "demo", created_at: new Date().toISOString(), approved_version: 1, approval_status: "approved", revisions: [{ version: 1, steps: {} }] },
    } }));
    expect(() => readPlan(root, "demo", 1)).toThrow("quarantined");
    expect(() => readPlan(root, "demo", 1)).toThrow("initialize_plan(plan_id, goal)");
    expect(initializePlan(root, "demo", "recovered goal").goal).toBe("recovered goal");
    const database = JSON.parse(readFileSync(join(root, ".opencode", "plan-tools.json"), "utf8"));
    expect(database.plans.demo.goal).toBe("recovered goal");
    expect(database.quarantine_history.demo).toEqual([expect.objectContaining({ id: "demo", revisions: [{ version: 1, steps: {} }] })]);
    expect(database.quarantined_plans?.demo).toBeUndefined();
  });
});
