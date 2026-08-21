import { runCodeReview, reviewCommand, reviewTemplate } from "./review.js";

export const hooks = (
  client: any,
  $: any,
  directory: string,
  options: Record<string, unknown>,
) => ({
  "command.execute.before": async (input: any, output: any) => {
    if (input.command !== reviewCommand && input.command !== reviewTemplate) return;
    const text = await runCodeReview({
      shell: ((strings: TemplateStringsArray, ...values: string[]) =>
        $(strings, ...values)) as any,
    });
    // Replace every intercepted part (including the expanded dummy template)
    // with a display-only result so no dummy prompt can reach an agent after
    // either approval or feedback.
    output.parts.splice(0, output.parts.length, {
      type: "text",
      text,
      ignored: true,
    });
  },
});
