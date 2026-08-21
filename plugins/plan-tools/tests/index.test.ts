import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jest } from "@jest/globals";
jest.mock("@opencode-ai/plugin", () => ({
  tool: Object.assign((input: unknown) => input, { schema: require("zod") }),
}), { virtual: true });
import { initializePlan, insertStep, readPlan, readPlanStep, submitPlan, submitPlanWithApproval, updateStep, type ApprovalRuntime } from "../src/index.js";

const step = (id: string, dependency_ids: string[] = [], owned_paths = [`${id}.ts`]) => ({ id, dependency_ids, owned_paths, goal: `goal ${id}`, implementation: `implementation ${id}`, verification: `verify ${id}` });

describe("plan tools", () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "plan-tools-")); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  test("stores project-scoped drafts and reads only approved revisions", () => {
    initializePlan(root, "demo");
    insertStep(root, "demo", step("one"));
    expect(() => readPlan(root, "demo")).toThrow("no approved");
    submitPlan(root, "demo");
    updateStep(root, "demo", step("one", [], ["changed.ts"]));
    expect(readPlanStep(root, "demo", "one").owned_paths).toEqual(["one.ts"]);
    expect(readPlan(root, "demo").version).toBe(1);
  });

  test("rejects missing dependencies, cycles, and independent path conflicts", () => {
    initializePlan(root, "demo");
    expect(() => insertStep(root, "demo", step("a", ["missing"]))).toThrow("missing dependency");
    insertStep(root, "demo", step("a", [], ["same.ts"]));
    expect(() => insertStep(root, "demo", step("b", [], ["same.ts"]))).toThrow("conflicting owned paths");
  });

  test("permits shared paths when dependency order is explicit and detects cycles", () => {
    initializePlan(root, "demo");
    insertStep(root, "demo", step("a", [], ["same.ts"]));
    insertStep(root, "demo", step("b", ["a"], ["same.ts"]));
    expect(() => updateStep(root, "demo", step("a", ["b"], ["same.ts"]))).toThrow("cycle");
    submitPlan(root, "demo");
    expect(readPlan(root, "demo").steps).toHaveLength(2);
  });

  const runtime = (approved: boolean, agent = "fleet", prompt: ApprovalRuntime["prompt"] = async () => undefined): ApprovalRuntime => ({
    shell: jest.fn(() => ({ json: async () => ({ approved }) })) as never,
    agents: async () => [{ name: agent }], prompt, sessionID: "session-1", directory: root, approvalAgent: agent,
  });

  test("persists approval, immutable artifact hash, and the handoff prompt", async () => {
    initializePlan(root, "demo"); insertStep(root, "demo", step("one"));
    const prompt = jest.fn(async () => undefined) as ApprovalRuntime["prompt"];
    const result = await submitPlanWithApproval(root, "demo", runtime(true, "fleet", prompt));
    expect(result.status).toBe("approved");
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(prompt).toHaveBeenCalledWith(expect.objectContaining({
      path: { id: "session-1" }, body: { agent: "fleet", parts: [{ type: "text", text: "Execute approved plan demo@1; call read_plan first." }] },
    }));
    const db = JSON.parse(readFileSync(join(root, ".opencode", "plan-tools.json"), "utf8"));
    expect(db.plans.demo.approval_status).toBe("approved");
    expect(db.plans.demo.artifact_hash).toBe(result.hash);
    expect(readFileSync(db.plans.demo.artifact, "utf8")).toContain("# Plan demo — revision 1");
  });

  test("persists denial and keeps the plan non-executable", async () => {
    initializePlan(root, "demo"); insertStep(root, "demo", step("one"));
    const result = await submitPlanWithApproval(root, "demo", runtime(false));
    expect(result.status).toBe("denied");
    expect(() => readPlan(root, "demo")).toThrow("no approved");
  });

  test.each([
    ["unavailable agent", { ...runtime(true), agents: async () => [{ name: "other" }] }, "approval agent unavailable"],
    ["missing config", { ...runtime(true), approvalAgent: "" }, "approval agent is not configured"],
  ])("leaves the plan non-executable on %s", async (_name, approvalRuntime, message) => {
    initializePlan(root, "demo"); insertStep(root, "demo", step("one"));
    await expect(submitPlanWithApproval(root, "demo", approvalRuntime)).rejects.toThrow(message);
    expect(() => readPlan(root, "demo")).toThrow("no approved");
  });
});
