import { AgentContext } from "./ContextBuilder.js";

export type RulesetResult = {
  reason: string;
  ruleId: string;
};

export class RulesetEvaluator {
  /**
   * Evaluate ruleset and return a derived reason if allowed.
   * This is a stub implementation.
   */
  evaluate(ctx: AgentContext): RulesetResult | null {
    // Phase 1: Always allow exploratory planning
    return {
      ruleId: "R-00",
      reason:
        "[ruleset] Exploratory analysis permitted (no explicit violations configured)"
    };
  }
}
