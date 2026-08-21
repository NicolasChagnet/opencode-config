import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadPlan, savePlan } from "./storage.js";
import { validateGraph } from "./validation.js";
import type {
  ApprovalRuntime,
  Plan,
  PromptInput,
  SubmissionResult,
} from "./types.js";

const textPrompt = (
  agent: string,
  sessionID: string,
  directory: string,
  text: string,
): PromptInput => ({
  path: { id: sessionID },
  query: { directory },
  body: { agent, parts: [{ type: "text", text }] },
});

const markdown = (plan: Plan) =>
  [
    `# Plan ${plan.id}`,
    `Goal: ${plan.goal}`,
    "",
    ...Object.values(plan.steps).flatMap((step) => [
      `## Step ${step.id}`,
      `- Dependencies: ${step.dependency_ids.join(", ") || "none"}`,
      `- Owned paths: ${step.owned_paths.join(", ")}`,
      `- Goal: ${step.step_goal}`,
      `- Implementation: ${step.implementation}`,
      `- Verification: ${step.verification}`,
      "",
    ]),
  ].join("\n");
export type PlannotatorAnnotateResult =
  { approved: true; feedback?: string } | { approved: false; feedback: string };

export function parsePlannotatorAnnotate(
  value: unknown,
): PlannotatorAnnotateResult {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch (error) {
      throw new Error("invalid Plannotator approval result", { cause: error });
    }
  }
  if (!value || typeof value !== "object")
    throw new Error("invalid Plannotator approval result");
  const result = value as {
    approved?: unknown;
    decision?: unknown;
    feedback?: unknown;
  };
  if (result.feedback !== undefined && typeof result.feedback !== "string")
    throw new Error("invalid Plannotator feedback");
  const feedback =
    typeof result.feedback === "string" ? result.feedback.trim() : "";
  const approved =
    typeof result.approved === "boolean"
      ? result.approved
      : result.decision === "approved"
        ? true
        : result.decision === "dismissed" || result.decision === "annotated"
          ? false
          : undefined;
  if (approved === undefined)
    throw new Error("invalid Plannotator approval result");
  if (!approved && !feedback)
    throw new Error("Plannotator feedback is missing");
  return approved
    ? { approved: true, ...(feedback ? { feedback } : {}) }
    : { approved: false, feedback };
}

export async function submitPlanWithApproval(
  root: string,
  id: string,
  runtime: ApprovalRuntime,
): Promise<SubmissionResult> {
  const plan = loadPlan(root, id);
  validateGraph(plan.steps);
  if (!runtime.approvalAgent.trim())
    throw new Error("approval agent is not configured");
  const content = markdown(plan),
    hash = createHash("sha256").update(content).digest("hex"),
    directory = join(root, ".opencode", "plan-artifacts"),
    artifact = join(directory, `${encodeURIComponent(id)}-${hash}.md`);
  mkdirSync(directory, { recursive: true });
  try {
    writeFileSync(artifact, content, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  plan.artifact = artifact;
  plan.artifact_hash = hash;
  let result: PlannotatorAnnotateResult;
  try {
    result = parsePlannotatorAnnotate(
      await runtime.shell`plannotator annotate ${artifact} --gate --json`.json(),
    );
  } catch (error) {
    plan.approval_status = "error";
    savePlan(root, plan);
    throw error;
  }
  if (!result.approved) {
    plan.approval_status = "denied";
    plan.approved = false;
    savePlan(root, plan);
    return { status: "feedback", hash, feedback: result.feedback };
  }
  const agents = await runtime.agents();
  if (
    !agents.some(
      (agent) =>
        agent.name === runtime.approvalAgent ||
        agent.id === runtime.approvalAgent,
    )
  ) {
    plan.approval_status = "error";
    savePlan(root, plan);
    return {
      status: "error",
      hash,
      error: `approval agent unavailable: ${runtime.approvalAgent}`,
    };
  }
  plan.approval_status = "approved";
  plan.approved = true;
  savePlan(root, plan);
  const prompt = textPrompt(
    runtime.approvalAgent,
    runtime.sessionID,
    runtime.directory,
    `Plan ${id} is approved. Orchestrate its dependency-ordered steps using the plan tools.`,
  );
  try {
    await (runtime.promptAsync ?? runtime.prompt)(prompt);
  } catch (error) {
    plan.approved = false;
    savePlan(root, plan);
    return {
      status: "error",
      hash,
      error: `handoff failed: ${String(error)}`,
    };
  }
  return { status: "approved", hash };
}
