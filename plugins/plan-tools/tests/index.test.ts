import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jest } from "@jest/globals";

jest.mock("@opencode-ai/plugin", () => ({ tool: Object.assign((input: unknown) => input, { schema: require("zod") }) }), { virtual: true });
import { glimpsePlan, initializePlan, insertStep, listPlans, markStepDone, parsePlannotatorAnnotate, readPlan, removeStep, submitPlan, updateStep } from "../src/index.js";
import { tools } from "../src/tools.js";

const step = (id: string, dependencies: string[] = []) => ({ id, dependency_ids: dependencies, owned_paths: [`${id}.ts`], step_goal: `goal ${id}`, implementation: `implementation ${id}`, verification: `verify ${id}` });

describe("plan storage", () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "plan-tools-")); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  test("stores one JSON file per plan and edits the draft in place", () => {
    initializePlan(root, "demo", "ship the demo");
    insertStep(root, "demo", step("one"));
    insertStep(root, "demo", step("two", ["one"]));
    expect(readFileSync(join(root, ".opencode", "plans", "demo.json"), "utf8")).toContain('"id": "demo"');
    submitPlan(root, "demo");
    updateStep(root, "demo", { ...step("one"), owned_paths: ["changed.ts"] });
    expect(() => readPlan(root, "demo")).toThrow("not approved");
    submitPlan(root, "demo");
    expect(readPlan(root, "demo").steps.find((step) => step.id === "one")?.owned_paths).toEqual(["changed.ts"]);
    removeStep(root, "demo", "two");
  });

  test("computes deterministic waves and rejects invalid graphs", () => {
    initializePlan(root, "demo", "ship the demo");
    insertStep(root, "demo", step("z"));
    insertStep(root, "demo", step("a"));
    insertStep(root, "demo", step("m", ["a", "z"]));
    expect(() => glimpsePlan(root, "demo")).toThrow("not approved");
    submitPlan(root, "demo");
    expect(glimpsePlan(root, "demo").waves).toEqual([["a", "z"], ["m"]]);
    expect(() => insertStep(root, "demo", step("bad", ["missing"]))).toThrow("missing dependency");
  });

  test("parses Plannotator approval and feedback", () => {
    expect(parsePlannotatorAnnotate({ decision: "approved" })).toEqual({ approved: true });
    expect(parsePlannotatorAnnotate('{"approved":false,"feedback":" revise the goal "}')).toEqual({ approved: false, feedback: "revise the goal" });
    expect(() => parsePlannotatorAnnotate({ decision: "annotated" })).toThrow("feedback is missing");
  });

  test("lists all persisted plans including unapproved ones with id and created_at", () => {
    initializePlan(root, "alpha", "goal alpha", "ctx alpha");
    initializePlan(root, "beta", "goal beta", "ctx beta");
    const plans = listPlans(root);
    expect(plans.map((plan) => plan.id).sort()).toEqual(["alpha", "beta"]);
    expect(plans.every((plan) => typeof plan.created_at === "string" && !Number.isNaN(Date.parse(plan.created_at)))).toBe(true);
  });

  test("new steps default done to false", () => {
    initializePlan(root, "demo", "goal", "ctx");
    expect(insertStep(root, "demo", step("one")).done).toBe(false);
  });

  test("markStepDone persists done=true, is idempotent, and preserves approval", () => {
    initializePlan(root, "demo", "goal", "ctx");
    insertStep(root, "demo", step("one"));
    submitPlan(root, "demo");
    expect(markStepDone(root, "demo", "one").done).toBe(true);
    expect(markStepDone(root, "demo", "one").done).toBe(true);
    expect(readPlan(root, "demo").steps.find((s) => s.id === "one")?.done).toBe(true);
    expect(() => markStepDone(root, "demo", "missing")).toThrow("unknown step");
  });

  test("registers list_plans and mark_step_done on the tool surface", () => {
    const surface = tools({}, () => ({}) as never);
    expect(Object.keys(surface)).toEqual(expect.arrayContaining(["list_plans", "mark_step_done"]));
    expect(surface.list_plans.args).toEqual({});
    expect(Object.keys(surface.mark_step_done.args)).toEqual(["plan_id", "step_id"]);
  });

});
