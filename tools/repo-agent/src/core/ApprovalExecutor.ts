import type { PatchPlan } from "../schemas/PatchPlan.js";
import { defaultLogger } from "./Logger.js";

export class ApprovalExecutor {
  async execute(plan: PatchPlan, branch: string) {
  // ApprovalExecutor must NEVER mutate git state.
  // Branch lifecycle is owned exclusively by Agent.ts.
  // This executor only exists to encapsulate approval logic.

  // Add lightweight logging for observability and auditing.
  // This is intentionally non-fatal and does not change behavior.
  try {
  defaultLogger.info(
  `ApprovalExecutor.execute called for branch=${branch} ops=${plan?.ops?.length ?? 0}`
  );
  // Log meta at debug level to avoid noisy production logs but keep info for developers.
  defaultLogger.debug("ApprovalExecutor.plan_meta", plan?.meta ?? {});
  } catch (err) {
  // Logging must never throw or change execution
  try {
  console.warn("ApprovalExecutor logging failure", err);
  } catch {}
  }

  // Currently approval is implicit once executeApprovedPlan is called.
  // This file intentionally does nothing destructive.
  return true;
  }
}
