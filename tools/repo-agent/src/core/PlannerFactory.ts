// tools/repo-agent/src/core/PlannerFactory.ts
import { resolveArtifactsDirAbs } from "../util/artifactsDir.js";
import { OpenAIPlanner } from "./OpenAIPlanner.js";
import { StubPlanner } from "./StubPlanner.js";
import type { AgentConfig } from "./Config.js";

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
  reason?: string;
  mode: string;
  filesPreview: Array<{ path: string; content: string }>;
};

export interface IPlanner {
  planPatch(input: PlannerInput): Promise<any>;
}

export function createPlanner(cfg: AgentConfig): IPlanner {
  if (!cfg.enableLLM) return new StubPlanner();

  const artifactsDirAbs = resolveArtifactsDirAbs(cfg.repoRoot, cfg.artifactsDir);

  return new OpenAIPlanner({
    apiKey: cfg.openai.apiKey,
    planningModel: cfg.openai.model,
    patchModel: cfg.openai.patchModel,
    artifactsDir: artifactsDirAbs,
  });
}
