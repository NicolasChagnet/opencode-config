import { loadPlan, planFile, savePlan } from "./storage.js";
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

export function initializePlan(root: string, id: string, goal: string): Plan {
  idText(id);
  if (existsSync(planFile(root, id)))
    throw new Error(`plan already exists: ${id}`);
  const plan: Plan = {
    schema_version: 1,
    id,
    goal: requiredText(goal, "goal"),
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
  if (
    Object.values(plan.steps).some((step) =>
      step.dependency_ids.includes(stepId),
    )
  )
    throw new Error(`step is required by another step: ${stepId}`);
  delete plan.steps[stepId];
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
  return { id, goal: plan.goal, steps: Object.values(plan.steps) };
}
export function glimpsePlan(root: string, id: string) {
  const plan = approved(root, id),
    remaining = new Set(Object.keys(plan.steps)),
    waves: string[][] = [];
  while (remaining.size) {
    const wave = [...remaining]
      .filter((step) =>
        plan.steps[step].dependency_ids.every((dep) => !remaining.has(dep)),
      )
      .sort();
    if (!wave.length) throw new Error("plan contains a dependency cycle");
    waves.push(wave);
    wave.forEach((step) => {
      remaining.delete(step);
    });
  }
  return { id, goal: plan.goal, waves };
}
export function readPlanStep(root: string, id: string, stepId: string) {
  const plan = approved(root, id),
    step = plan.steps[stepId];
  if (!step) throw new Error(`unknown step: ${stepId}`);
  return step;
}
