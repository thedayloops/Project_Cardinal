// tools/repo-agent/src/core/PlannerFactory.ts
import path from "node:path";
import { OpenAIPlanner } from "./OpenAIPlanner.js";
import { StubPlanner } from "./StubPlanner.js";
import type { AgentConfig } from "./Config.js";

/**
 * Input passed to planners.
 * Keep this minimal and explicit.
 */
export type PlannerInput = {
  repo: {
    root: string;
    headSha: string;
    branch: string;
  };

  scope: {
    files: string[];
    total_ops: number;
    estimated_bytes_changed: number;
  };

  mode: string;
  reason?: string;

  filesPreview: Array<{
    path: string;
    content: string;
  }>;
};

export interface IPlanner {
  planPatch(input: PlannerInput): Promise<any>;
}

/**
 * Factory for selecting the active planner.
 * This is the ONLY place planner selection happens.
 */
export function createPlanner(cfg: AgentConfig): IPlanner {
  if (cfg.enableLLM) {
    return new OpenAIPlanner({
      apiKey: cfg.openai.apiKey,
      planningModel: cfg.openai.model,
      patchModel: cfg.openai.patchModel,

      // Token ledger + artifacts are always rooted here
      artifactsDir: path.resolve(cfg.repoRoot, cfg.artifactsDir),
    });
  }

  // Safe fallback: no LLM, deterministic behavior
  return new StubPlanner();
}
