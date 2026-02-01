import path from "node:path";

export type AgentConfig = {
  // Roots
  repoRoot: string;  // repo-agent root
  targetRepoRoot: string;   // simulator / target repo root

  // Artifacts
  artifactsDir: string;
  artifactMaxCount: number;
  artifactMaxAgeDays: number;

  // Agent behavior
  enableLLM: boolean;
  requireConfirm: boolean;
  watch: boolean;

  // OpenAI
  openai: {
  apiKey: string;
  model: string;
  patchModel: string;
  };

  // Planner limits
  planner: {
  maxFiles: number;
  maxCharsPerFile: number;
  maxTotalChars: number;
  maxInputTokens: number;
  secondPassMaxFiles: number;
  };

  // Guardrails
  guardrails: {
  maxOps: number;
  maxTotalWriteBytes: number;
  maxFileBytes: number;
  lockedPathPrefixes: string[];
  deniedPathPrefixes: string[];
  };

  // Token safety
  tokenSafety: {
  maxCallsPerDay: number;
  allowWatchLLM: boolean;
  maxFilesFromLLM: number;
  };

  nodeEnv: string;
};

function num(v: string | undefined, d: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function bool(v: string | undefined, d = false) {
  if (v == null) return d;
  return v === "true" || v === "1";
}

export function loadConfig(): AgentConfig {
  const repoRoot = process.cwd();

  const targetRepoRoot =
  process.env.AGENT_TARGET_REPO_ROOT
  ? path.resolve(process.env.AGENT_TARGET_REPO_ROOT)
  : repoRoot; // safe default until you point it at the simulator

  return {
  repoRoot,
  targetRepoRoot,

  artifactsDir: process.env.AGENT_ARTIFACTS_DIR ?? "agent_artifacts",
  artifactMaxCount: num(process.env.AGENT_ARTIFACT_MAX_COUNT, 25),
  artifactMaxAgeDays: num(process.env.AGENT_ARTIFACT_MAX_AGE_DAYS, 7),

  enableLLM: bool(process.env.AGENT_ENABLE_LLM, true),
  requireConfirm: bool(process.env.AGENT_REQUIRE_CONFIRM, true),
  watch: bool(process.env.AGENT_WATCH, false),

  openai: {
  apiKey: process.env.OPENAI_API_KEY ?? "",
  // Use a safer, current default model identifier when env is not set.
  model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  // Use a conservative default for patching/modeling tasks. Prefer a smaller patch model
  // by default to reduce token usage and surface risk when not explicitly configured.
  patchModel: process.env.OPENAI_MODEL_PATCH ?? "gpt-4o-mini",
  },

  planner: {
  maxFiles: num(process.env.AGENT_PLANNER_MAX_FILES, 10),
  maxCharsPerFile: num(process.env.AGENT_PLANNER_MAX_CHARS_PER_FILE, 15000),
  maxTotalChars: num(process.env.AGENT_PLANNER_MAX_TOTAL_CHARS, 60000),
  maxInputTokens: num(process.env.AGENT_PLANNER_MAX_INPUT_TOKENS, 30000),
  secondPassMaxFiles: num(process.env.AGENT_PLANNER_SECOND_PASS_MAX_FILES, 16),
  },

  guardrails: {
  maxOps: num(process.env.AGENT_MAX_OPS, 25),
  maxTotalWriteBytes: num(process.env.AGENT_MAX_WRITE_BYTES, 300000),
  maxFileBytes: 300_000,
  lockedPathPrefixes: ["node_modules/", ".git/"],
  deniedPathPrefixes: [],
  },

  tokenSafety: {
  maxCallsPerDay: num(process.env.AGENT_MAX_LLM_CALLS_PER_DAY, 50),
  allowWatchLLM: bool(process.env.AGENT_ALLOW_WATCH_LLM, false),
  maxFilesFromLLM: num(process.env.AGENT_MAX_FILES_FROM_LLM, 20),
  },

  nodeEnv: process.env.NODE_ENV ?? "development",
  };
}
