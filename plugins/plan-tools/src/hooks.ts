import { runCodeReview, reviewCommand, reviewTemplate } from "./review.js";
import { tools } from "./tools.js";
import type { ApprovalRuntime } from "./types.js";

export const hooks = (
  client: any,
  $: any,
  directory: string,
  options: Record<string, unknown>,
) => ({
  "command.execute.before": async (input: any, output: any) => {
    if (input.command !== reviewCommand && input.command !== reviewTemplate) return;
    const result = await runCodeReview({
      shell: ((strings: TemplateStringsArray, ...values: string[]) =>
        $(strings, ...values)) as any,
    });
    if (result.status === "approved") {
      output.parts.splice(0, output.parts.length);
      return;
    }
    output.parts.splice(0, output.parts.length, {
      type: "text",
      text:
        result.status === "feedback"
          ? `Code-review feedback from Plannotator. Address these findings:\n${result.feedback}`
          : `Code review failed: ${result.error}`,
      ignored: true,
    });
  },
  tool: tools(options, (context): ApprovalRuntime => ({
    shell: ((strings: TemplateStringsArray, ...values: string[]) =>
      $(strings, ...values)) as any,
    agents: async () =>
      (await client.app.agents({ query: { directory: context.directory } }))
        .data ?? [],
    prompt: async (input) => {
      await client.session.prompt(input);
    },
    promptAsync: async (input) => {
      await client.session.promptAsync(input);
    },
    sessionID: context.sessionID,
    directory: context.directory,
    approvalAgent: String(options.approval_agent ?? ""),
  })),
});
