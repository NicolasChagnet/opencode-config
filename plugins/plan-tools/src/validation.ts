import type { Step } from "./types.js";

export type PlannotatorDecision =
  | { approved: true; feedback?: string }
  | { approved: false; feedback: string };

/** Normalize Plannotator's approved/decision + feedback envelope. */
export function parsePlannotatorDecision(
  value: unknown,
  label: string,
): PlannotatorDecision {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch (error) {
      throw new Error(`invalid Plannotator ${label} result`, { cause: error });
    }
  }
  if (!value || typeof value !== "object")
    throw new Error(`invalid Plannotator ${label} result`);
  const result = value as {
    approved?: unknown;
    decision?: unknown;
    feedback?: unknown;
  };
  if (result.feedback !== undefined && typeof result.feedback !== "string")
    throw new Error(`invalid Plannotator ${label} feedback`);
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
    throw new Error(`invalid Plannotator ${label} result`);
  if (!approved && !feedback)
    throw new Error(`Plannotator ${label} feedback is missing`);
  return approved
    ? { approved: true, ...(feedback ? { feedback } : {}) }
    : { approved: false, feedback };
}

export const requiredText = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${field} must be a non-empty string`);
  return value.trim();
};

export function validateStep(input: Step, steps: Record<string, Step>): Step {
  const id = requiredText(input.id, "id");
  if (!/^[A-Za-z0-9._-]+$/.test(id))
    throw new Error("id contains invalid characters");
  if (
    !Array.isArray(input.dependency_ids) ||
    input.dependency_ids.some((x) => typeof x !== "string")
  )
    throw new Error("dependency_ids must be strings");
  if (
    !Array.isArray(input.owned_paths) ||
    input.owned_paths.some((x) => typeof x !== "string")
  )
    throw new Error("owned_paths must be strings");
  if (new Set(input.dependency_ids).size !== input.dependency_ids.length)
    throw new Error("duplicate dependency IDs");
  if (input.dependency_ids.includes(id))
    throw new Error("a step cannot depend on itself");
  for (const dependency of input.dependency_ids)
    if (!steps[dependency])
      throw new Error(`missing dependency: ${dependency}`);
  const paths = input.owned_paths.map((path) =>
    requiredText(path, "owned path").replaceAll("\\", "/"),
  );
  if (new Set(paths).size !== paths.length)
    throw new Error("duplicate owned paths");
  for (const path of paths)
    if (
      path.startsWith("/") ||
      path === "." ||
      path.split("/").includes("..") ||
      /[*?[\]{}]/.test(path)
    )
      throw new Error(`owned path must be exact and relative: ${path}`);
  return {
    id,
    dependency_ids: [...input.dependency_ids],
    owned_paths: paths,
    step_goal: requiredText(input.step_goal, "step_goal"),
    implementation: requiredText(input.implementation, "implementation"),
    verification: requiredText(input.verification, "verification"),
    done: input.done === true,
  };
}

export function validateGraph(steps: Record<string, Step>): void {
  for (const step of Object.values(steps)) validateStep(step, steps);
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error("plan contains a dependency cycle");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of steps[id].dependency_ids) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of Object.keys(steps)) visit(id);
  const ancestors = (id: string, seen = new Set<string>()): Set<string> => {
    for (const dependency of steps[id].dependency_ids)
      if (!seen.has(dependency)) {
        seen.add(dependency);
        ancestors(dependency, seen);
      }
    return seen;
  };
  const all = Object.values(steps);
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      if (!all[i].owned_paths.some((path) => all[j].owned_paths.includes(path)))
        continue;
      if (
        !ancestors(all[i].id).has(all[j].id) &&
        !ancestors(all[j].id).has(all[i].id)
      )
        throw new Error(
          `conflicting owned paths between ${all[i].id} and ${all[j].id}`,
        );
    }
}
