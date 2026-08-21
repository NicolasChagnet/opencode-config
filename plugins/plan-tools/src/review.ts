import { spawn } from "node:child_process";

export type ReviewRuntime = {
  run: (
    args: string[],
    options: { cwd: string; timeout: number; signal: AbortSignal },
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  agents: () => Promise<Array<{ name?: string; id?: string }>>;
  prompt: (input: {
    path: { id: string };
    body: { agent: string; parts: [{ type: "text"; text: string }] };
    query: { directory: string };
  }) => Promise<unknown>;
  sessionID: string;
  directory: string;
};

export type ReviewResult = {
  status: "approved" | "feedback" | "error";
  feedback?: string;
  target?: string;
  error?: string;
};

export const reviewCommand = "__opencode_plan_tools_code_review__";

const reviewTimeout = 120_000;
const reviewPromptLimit = 8_000;
const feedbackTruncationNotice = "\n[feedback truncated]";

export function runReviewCommand(
  args: string[],
  cwd: string,
  timeout = reviewTimeout,
  signal?: AbortSignal,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Plannotator review cancelled"));
      return;
    }
    const child = spawn("plannotator", args, { cwd, shell: false });
    let stdout = "",
      stderr = "",
      settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      callback();
    };
    const abort = () => {
      child.kill("SIGTERM");
      finish(() => reject(new Error("Plannotator review cancelled")));
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(() => reject(new Error("Plannotator review timed out")));
    }, timeout);
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (exitCode) =>
      finish(() => resolve({ stdout, stderr, exitCode: exitCode ?? 1 })),
    );
  });
}

function parseReviewOutput(stdout: string): {
  approved: boolean;
  feedback?: string;
  target?: string;
} {
  const result = JSON.parse(stdout) as {
    approved?: unknown;
    feedback?: unknown;
    target?: unknown;
  };
  if (typeof result?.approved !== "boolean")
    throw new Error("invalid Plannotator review result");
  if (result.feedback !== undefined && typeof result.feedback !== "string")
    throw new Error("invalid Plannotator review feedback");
  if (result.target !== undefined && typeof result.target !== "string")
    throw new Error("invalid Plannotator review target");
  return {
    approved: result.approved,
    feedback: result.feedback,
    target: result.target,
  };
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
    const result = await runtime.run(["review", "--json"], {
      cwd: runtime.directory,
      timeout: reviewTimeout,
      signal: new AbortController().signal,
    });
    if (result.exitCode !== 0)
      return {
        status: "error",
        error:
          result.stderr.trim() ||
          `Plannotator exited with code ${result.exitCode}`,
      };
    const parsed = parseReviewOutput(result.stdout);
    if (parsed.approved) return { status: "approved" };

    const agents = await runtime.agents();
    const available = (name: string) =>
      agents.some((agent) => agent.name === name || agent.id === name);
    const target =
      parsed.target ??
      (available("frigate")
        ? "frigate"
        : available("admiral")
          ? "admiral"
          : undefined);
    if (target !== "frigate" && target !== "admiral")
      return {
        status: "error",
        error: `review target unavailable or invalid: ${parsed.target ?? "missing"}`,
      };
    if (!available(target))
      return { status: "error", error: `review target unavailable: ${target}` };
    const feedback = (parsed.feedback ?? "").trim();
    if (!feedback)
      return { status: "error", error: "review feedback is missing" };
    return { status: "feedback", feedback: boundFeedback(feedback), target };
  } catch (error) {
    return { status: "error", error: String(error) };
  }
}
