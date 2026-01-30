import { AgentContext } from "./ContextBuilder.js";
import { PatchPlan } from "../schemas/PatchPlan.js";
import { OpenAIPlanner } from "./OpenAIPlanner.js";
import { StubPlanner } from "./StubPlanner.js";

export interface IPlanner {
  planPatch(ctx: AgentContext): Promise<PatchPlan>;
}

export function createPlanner(
  mode: "scan" | "plan" | "verify" | "deep",
  repoRoot: string,
  artifactsDir: string
): IPlanner {
  // For now: OpenAI planner is gated / stubbed
  // You can later switch by mode
  if (mode === "scan") {
    return new StubPlanner();
  }

  return new OpenAIPlanner(repoRoot, artifactsDir);
}
