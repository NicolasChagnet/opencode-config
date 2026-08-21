import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jest } from "@jest/globals";

jest.mock("@opencode-ai/plugin", () => ({ tool: Object.assign((input: unknown) => input, { schema: require("zod") }) }), { virtual: true });
import { glimpsePlan, initializePlan, insertStep, parsePlannotatorAnnotate, readPlan, removeStep, submitPlan, updateStep } from "../src/index.js";

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

});
