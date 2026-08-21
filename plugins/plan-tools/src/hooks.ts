import { tools } from "./tools.js";
import type { ApprovalRuntime } from "./types.js";

export const hooks = (
  client: any,
  $: any,
  directory: string,
  options: Record<string, unknown>,
) => ({
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
