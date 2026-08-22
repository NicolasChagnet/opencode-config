export type ReviewRuntime = {
  shell: (
    strings: TemplateStringsArray,
    ...values: string[]
  ) => { text(): Promise<string> };
};

export const reviewCommand = "code-review";
// Legacy dummy-template text expanded by the /code-review command definition.
// Intercepted so it can never reach an agent after approval or feedback.
export const reviewTemplate = "__opencode_plan_tools_code_review__";

const reviewPromptLimit = 8_000;
const feedbackTruncationNotice = "\n[feedback truncated]";

export const reviewMarker = "manual user review:\n";

function boundOutput(output: string): string {
  if (output.length <= reviewPromptLimit) return output;
  return (
    output.slice(0, reviewPromptLimit - feedbackTruncationNotice.length) +
    feedbackTruncationNotice
  );
}

export async function runCodeReview(runtime: ReviewRuntime): Promise<string> {
  try {
    const output = await runtime.shell`plannotator review`.text();
    return reviewMarker + boundOutput(output);
  } catch (error) {
    return `Code review failed: ${String(error)}`;
  }
}
