import { AgentContext } from "./ContextBuilder.js";
import { PatchPlan } from "../schemas/PatchPlan.js";

export type FilePlan = {
  intent: string;
  files: string[];
};

export interface IPlanner {
  planFiles(ctx: AgentContext): Promise<FilePlan>;

  /**
   * Propose a structured, reversible patch plan.
   * Must read scope from ctx.scope.files.
   */
  planPatch(ctx: AgentContext): Promise<PatchPlan>;
}
