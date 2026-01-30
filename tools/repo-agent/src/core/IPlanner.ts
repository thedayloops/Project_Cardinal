import { AgentContext } from "./ContextBuilder.js";
import { PatchPlan } from "../schemas/PatchPlan.js";

export type FilePlan = {
  intent: string;
  files: string[];
};

export interface IPlanner {
  /**
   * Phase 1: decide WHICH files need changes.
   * Must be cheap.
   */
  planFiles(ctx: AgentContext): Promise<FilePlan>;

  /**
   * Phase 2: produce an actual PatchPlan.
   */
  planPatch(ctx: AgentContext): Promise<PatchPlan>;
}
