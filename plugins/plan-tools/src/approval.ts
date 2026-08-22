import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadPlan, savePlan } from "./storage.js";
import { readPlanStep } from "./plans.js";
import { parsePlannotatorDecision, validateGraph } from "./validation.js";
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
    `Context: ${plan.context}`,
    "",
    ...Object.values(plan.steps).flatMap((step) => [
      `## Step ${step.id}`,
      `- Owned paths: ${step.owned_paths.join(", ")}`,
      `- Goal: ${step.step_goal}`,
      `- Implementation: ${step.implementation}`,
      `- Verification: ${step.verification}`,
      "",
    ]),
  ].join("\n");
export type PlannotatorAnnotateResult =
  { approved: true; feedback?: string } | { approved: false; feedback: string };

export const parsePlannotatorAnnotate = (value: unknown) =>
  parsePlannotatorDecision(value, "approval");

/** Spawn an agent to implement a plan step. The agent retrieves its own contract. */
export async function delegateStep(
  root: string,
  planId: string,
  stepId: string,
  agent: string,
  runtime: ApprovalRuntime,
): Promise<{ status: "spawned"; agent: string }> {
  readPlanStep(root, planId, stepId); // requires an approved plan and existing step
  const target = agent.trim();
  if (!target) throw new Error("agent is required");
  const agents = await runtime.agents();
  if (!agents.some((entry) => entry.name === target || entry.id === target))
    throw new Error(`unknown agent: ${target}`);
  const prompt = textPrompt(
    target,
    runtime.sessionID,
    runtime.directory,
    `Implement step ${stepId} of plan ${planId}. Retrieve the immutable step contract with read_plan_step and use it as the single source of truth. Implement it within its scope and verification gates. Do not expand or re-derive the step from prompt text.`,
  );
  await runtime.prompt(prompt);
  return { status: "spawned", agent: target };
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
    `Plan ${id} is approved. Orchestrate its steps in order using the plan tools.`,
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
