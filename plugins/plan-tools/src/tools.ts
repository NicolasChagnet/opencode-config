import { tool } from "@opencode-ai/plugin";
import { submitPlanWithApproval } from "./approval.js";
import {
  glimpsePlan,
  initializePlan,
  insertStep,
  readPlan,
  readPlanStep,
  removeStep,
  updateStep,
} from "./plans.js";
import type { ApprovalRuntime, Step } from "./types.js";

const stepArgs = {
  plan_id: tool.schema.string(),
  id: tool.schema.string(),
  dependency_ids: tool.schema.array(tool.schema.string()),
  owned_paths: tool.schema.array(tool.schema.string()),
  goal: tool.schema.string(),
  implementation: tool.schema.string(),
  verification: tool.schema.string(),
};
const asStep = (args: Record<string, unknown>) =>
  ({ ...args, step_goal: args.goal }) as unknown as Step;
export const tools = (
  options: Record<string, unknown>,
  runtime: (context: any) => ApprovalRuntime,
) => ({
  initialize_plan: tool({
    description: "Create a new plan draft.",
    args: { plan_id: tool.schema.string(), goal: tool.schema.string() },
    execute: async ({ plan_id, goal }, context) =>
      JSON.stringify(initializePlan(context.worktree, plan_id, goal)),
  }),
  insert_step: tool({
    description: "Add a step to a plan.",
    args: stepArgs,
    execute: async (args, context) =>
      JSON.stringify(insertStep(context.worktree, args.plan_id, asStep(args))),
  }),
  update_step: tool({
    description: "Edit a plan step.",
    args: stepArgs,
    execute: async (args, context) =>
      JSON.stringify(updateStep(context.worktree, args.plan_id, asStep(args))),
  }),
  remove_step: tool({
    description: "Remove a step from a plan.",
    args: { plan_id: tool.schema.string(), step_id: tool.schema.string() },
    execute: async ({ plan_id, step_id }, context) => {
      removeStep(context.worktree, plan_id, step_id);
      return "removed";
    },
  }),
  submit_plan: tool({
    description: "Submit a plan for human approval.",
    args: { plan_id: tool.schema.string() },
    execute: async ({ plan_id }, context) =>
      JSON.stringify(
        await submitPlanWithApproval(
          context.worktree,
          plan_id,
          runtime(context),
        ),
      ),
  }),
  read_plan: tool({
    description: "Read the approved plan if it exists.",
    args: { plan_id: tool.schema.string() },
    execute: async ({ plan_id }, context) =>
      JSON.stringify(readPlan(context.worktree, plan_id)),
  }),
  read_plan_step: tool({
    description: "Read one step from an approved plan.",
    args: {
      plan_id: tool.schema.string(),
      step_id: tool.schema.string(),
    },
    execute: async ({ plan_id, step_id }, context) =>
      JSON.stringify(readPlanStep(context.worktree, plan_id, step_id)),
  }),
  glimpse_plan: tool({
    description:
      "Summarize the approved plan. Returns its goal and execution waves.",
    args: { plan_id: tool.schema.string() },
    execute: async ({ plan_id }, context) =>
      JSON.stringify(glimpsePlan(context.worktree, plan_id)),
  }),
});
