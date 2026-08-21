export type ReviewRuntime = {
  shell: (
    strings: TemplateStringsArray,
    ...values: string[]
  ) => { json(): Promise<unknown> };
};

export type ReviewResult = {
  status: "approved" | "feedback" | "error";
  feedback?: string;
  error?: string;
};

export const reviewCommand = "code-review";
export const reviewTemplate = "__opencode_plan_tools_code_review__";

const reviewPromptLimit = 8_000;
const feedbackTruncationNotice = "\n[feedback truncated]";

export type PlannotatorReview =
  { approved: true; feedback?: string } | { approved: false; feedback: string };

export function parsePlannotatorReview(value: unknown): PlannotatorReview {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch (error) {
      throw new Error("invalid Plannotator review result", { cause: error });
    }
  }
  if (!value || typeof value !== "object")
    throw new Error("invalid Plannotator review result");
  const result = value as {
    approved?: unknown;
    decision?: unknown;
    feedback?: unknown;
  };
  if (result.feedback !== undefined && typeof result.feedback !== "string")
    throw new Error("invalid Plannotator review feedback");
  const feedback =
    typeof result.feedback === "string" ? result.feedback.trim() : "";
  const approved =
    typeof result.approved === "boolean"
      ? result.approved
      : result.decision === "approved"
        ? true
        : result.decision === "annotated" || result.decision === "dismissed"
          ? false
          : undefined;
  if (approved === undefined)
    throw new Error("invalid Plannotator review result");
  if (!approved && !feedback)
    throw new Error("Plannotator review feedback is missing");
  return approved
    ? { approved: true, ...(feedback ? { feedback } : {}) }
    : { approved: false, feedback };
}

function boundFeedback(feedback: string): string {
  if (feedback.length <= reviewPromptLimit) return feedback;
  return (
    feedback.slice(0, reviewPromptLimit - feedbackTruncationNotice.length) +
    feedbackTruncationNotice
  );
}

export async function runCodeReview(
  runtime: ReviewRuntime,
): Promise<ReviewResult> {
  try {
    const parsed = parsePlannotatorReview(
      await runtime.shell`plannotator opencode-review`.json(),
    );
    return parsed.approved
      ? { status: "approved" }
      : { status: "feedback", feedback: boundFeedback(parsed.feedback) };
  } catch (error) {
    return { status: "error", error: String(error) };
  }
}
