import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jest } from "@jest/globals";

jest.mock("@opencode-ai/plugin", () => ({ tool: Object.assign((input: unknown) => input, { schema: require("zod") }) }), { virtual: true });
import { glimpsePlan, initializePlan, insertStep, parsePlannotatorAnnotate, readPlan, removeStep, submitPlan, updateStep } from "../src/index.js";
import { hooks } from "../src/hooks.js";
import { parsePlannotatorReview, runCodeReview, type ReviewRuntime } from "../src/review.js";

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

  test("returns review feedback to the originating session", async () => {
    const runtime: ReviewRuntime = {
      shell: (() => ({ json: async () => ({ approved: false, feedback: "fix this" }) })) as never,
    };
    expect(await runCodeReview(runtime)).toEqual({ status: "feedback", feedback: "fix this" });
  });

  test("dispatches the code-review command through the before hook", async () => {
    const shell = (() => ({ json: async () => ({ decision: "approved", feedback: "stale feedback" }) })) as never;
    const output = { parts: [{ type: "text", text: "original" }], ignored: true };
    const before = hooks({}, shell, "/tmp", {})["command.execute.before"];

    await before({ command: "code-review" }, output);

    expect(output.parts).toEqual([]);
    expect(output.ignored).toBe(true);
    expect(JSON.stringify(output)).not.toMatch(/failure|feedback/i);
  });

  test("also intercepts the expanded review template", async () => {
    const shell = (() => ({ json: async () => ({ approved: true }) })) as never;
    const output = { parts: [{ type: "text", text: "original" }] };
    const before = hooks({}, shell, "/tmp", {})["command.execute.before"];

    await before({ command: "__opencode_plan_tools_code_review__" }, output);

    expect(output.parts).toEqual([]);
  });

  test("transmits review feedback through the before hook", async () => {
    const shell = (() => ({ json: async () => ({ approved: false, feedback: "fix this" }) })) as never;
    const output = { parts: [{ type: "text", text: "original" }] };
    const before = hooks({}, shell, "/tmp", {})["command.execute.before"];

    await before({ command: "code-review" }, output);

    expect(output.parts).toEqual([
      {
        type: "text",
        text: "Code-review feedback from Plannotator. Address these findings:\nfix this",
        ignored: true,
      },
    ]);
  });

  test("parses review approval and feedback", () => {
    expect(parsePlannotatorReview({ approved: true })).toEqual({ approved: true });
    expect(parsePlannotatorReview({ decision: "approved" })).toEqual({ approved: true });
    expect(parsePlannotatorReview('{"approved":false,"feedback":" fix this "}')).toEqual({ approved: false, feedback: "fix this" });
    expect(parsePlannotatorReview('{"decision":"annotated","feedback":" fix this "}')).toEqual({ approved: false, feedback: "fix this" });
  });
});
