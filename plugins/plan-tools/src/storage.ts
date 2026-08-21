import {
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Plan } from "./types.js";

export const plansDirectory = (root: string) =>
  join(root, ".opencode", "plans");
export const planFile = (root: string, id: string) =>
  join(plansDirectory(root), `${id}.json`);

export function loadPlan(root: string, id: string): Plan {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(planFile(root, id), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new Error(`unknown plan: ${id}`);
    throw new Error(`failed to load plan: ${String(error)}`, { cause: error });
  }
  if (
    !value ||
    typeof value !== "object" ||
    (value as Plan).schema_version !== 1
  )
    throw new Error("invalid plan file");
  return value as Plan;
}

export function savePlan(root: string, plan: Plan): void {
  mkdirSync(plansDirectory(root), { recursive: true });
  const target = planFile(root, plan.id);
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(plan, null, 2)}\n`, {
      flag: "wx",
    });
    renameSync(temporary, target);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch (cleanup) {
      if ((cleanup as NodeJS.ErrnoException).code !== "ENOENT") throw cleanup;
    }
    throw error;
  }
}
