import { jest } from "@jest/globals";

jest.mock("@opencode-ai/plugin", () => ({ tool: Object.assign((input: unknown) => input, { schema: require("zod") }) }), { virtual: true });
import { runCodeReview, type ReviewRuntime } from "../src/index.js";
import { hooks } from "../src/hooks.js";

describe("review-tools", () => {
  test("labels completed command stdout under the manual review marker", async () => {
    const runtime: ReviewRuntime = {
      shell: (() => ({ text: async () => "fix this" })) as never,
    };
    expect(await runCodeReview(runtime)).toBe("manual user review:\nfix this");
  });

  test("runs the supported plannotator review command", async () => {
    let invoked = "";
    const runtime: ReviewRuntime = {
      shell: ((strings: TemplateStringsArray) => {
        invoked = strings[0];
        return { text: async () => "fix this" };
      }) as never,
    };
    expect(await runCodeReview(runtime)).toBe("manual user review:\nfix this");
    expect(invoked).toBe("plannotator review");
  });

  test("replaces parts with the labeled review output", async () => {
    const shell = (() => ({ text: async () => "fix this" })) as never;
    const output = { parts: [{ type: "text", text: "__opencode_plan_tools_code_review__" }] };
    const before = hooks({}, shell, "/tmp", {})["command.execute.before"];

    await before({ command: "code-review" }, output);

    expect(output.parts).toEqual([
      { type: "text", text: "manual user review:\nfix this", ignored: true },
    ]);
  });

  test("also intercepts the expanded review template", async () => {
    const shell = (() => ({ text: async () => "ok" })) as never;
    const output = { parts: [{ type: "text", text: "original" }] };
    const before = hooks({}, shell, "/tmp", {})["command.execute.before"];

    await before({ command: "__opencode_plan_tools_code_review__" }, output);

    expect(output.parts).toEqual([
      { type: "text", text: "manual user review:\nok", ignored: true },
    ]);
  });

  test("shell failures follow the existing error path", async () => {
    const shell = (() => ({ text: async () => { throw new Error("boom"); } })) as never;
    const output = { parts: [{ type: "text", text: "original" }] };
    const before = hooks({}, shell, "/tmp", {})["command.execute.before"];

    await before({ command: "code-review" }, output);

    expect(output.parts).toEqual([
      { type: "text", text: "Code review failed: Error: boom", ignored: true },
    ]);
  });
});
