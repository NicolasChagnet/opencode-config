import { listPlanSummaries, loadPlan, planFile, savePlan } from "./storage.js";
import { requiredText, validateGraph, validateStep } from "./validation.js";
import type { Plan, Step } from "./types.js";
import { existsSync } from "node:fs";

const idText = (id: string) => {
  requiredText(id, "plan_id");
  if (!/^[A-Za-z0-9._-]+$/.test(id))
    throw new Error("plan_id contains invalid characters");
  return id;
};
const editable = (plan: Plan) => {
  plan.approval_status = "pending";
  plan.approved = false;
};

export function initializePlan(root: string, id: string, goal: string, context: string): Plan {
  idText(id);
  if (existsSync(planFile(root, id)))
    throw new Error(`plan already exists: ${id}`);
  const plan: Plan = {
    schema_version: 1,
    id,
    goal: requiredText(goal, "goal"),
    context: requiredText(context, "context"),
    created_at: new Date().toISOString(),
    steps: {},
    approval_status: "pending",
    approved: false,
  };
  savePlan(root, plan);
  return plan;
}

export function insertStep(root: string, planId: string, step: Step): Step {
  const plan = loadPlan(root, planId);
  if (plan.steps[step.id]) throw new Error(`duplicate step ID: ${step.id}`);
  const next = { ...plan.steps, [step.id]: validateStep(step, plan.steps) };
  validateGraph(next);
  editable(plan);
  plan.steps = next;
  savePlan(root, plan);
  return plan.steps[step.id];
}

export function updateStep(root: string, planId: string, step: Step): Step {
  const plan = loadPlan(root, planId);
  if (!plan.steps[step.id]) throw new Error(`unknown step: ${step.id}`);
  const next = { ...plan.steps };
  delete next[step.id];
  next[step.id] = validateStep(step, next);
  validateGraph(next);
  editable(plan);
  plan.steps = next;
  savePlan(root, plan);
  return step;
}

export function removeStep(root: string, planId: string, stepId: string): void {
  const plan = loadPlan(root, planId);
  if (!plan.steps[stepId]) throw new Error(`unknown step: ${stepId}`);
  const next = { ...plan.steps };
  delete next[stepId];
  validateGraph(next);
  plan.steps = next;
  editable(plan);
  savePlan(root, plan);
}

/** Approve a validated draft without invoking the external Plannotator gate. */
export function submitPlan(root: string, id: string): Plan {
  const plan = loadPlan(root, id);
  validateGraph(plan.steps);
  plan.approval_status = "approved";
  plan.approved = true;
  savePlan(root, plan);
  return plan;
}

function approved(root: string, id: string): Plan {
  const plan = loadPlan(root, id);
  if (plan.approval_status !== "approved" || !plan.approved)
    throw new Error("plan is not approved");
  validateGraph(plan.steps);
  return plan;
}
export function readPlan(root: string, id: string) {
  const plan = approved(root, id);
  return { id, goal: plan.goal, context: plan.context, steps: Object.values(plan.steps) };
}
export function glimpsePlan(root: string, id: string) {
  const plan = approved(root, id);
  return {
    id,
    goal: plan.goal,
    steps: Object.values(plan.steps).map((s) => ({ id: s.id, done: s.done })),
  };
}
export function readPlanStep(root: string, id: string, stepId: string) {
  const plan = approved(root, id),
    step = plan.steps[stepId];
  if (!step) throw new Error(`unknown step: ${stepId}`);
  return step;
}

/** List all persisted current-format plans without the approval gate. */
export function listPlans(root: string) {
  return listPlanSummaries(root);
}

/** Persist done=true for a step, preserving approval state. Idempotent. */
export function markStepDone(root: string, planId: string, stepId: string): Step {
  idText(planId);
  const plan = loadPlan(root, planId);
  const step = plan.steps[stepId];
  if (!step) throw new Error(`unknown step: ${stepId}`);
  plan.steps[stepId] = { ...step, done: true };
  savePlan(root, plan);
  return plan.steps[stepId];
}
