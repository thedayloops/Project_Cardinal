// tools/repo-agent/src/core/Config.ts
import path from "node:path";

function mustEnv(key: string): string {
  const v = process.env[key];
  if (!v || v.trim() === "") throw new Error(`Missing required env var: ${key}`);
  return v.trim();
}

function boolEnv(key: string, def = false): boolean {
  const v = process.env[key];
  if (!v) return def;
  return ["1", "true", "yes", "y", "on"].includes(v.trim().toLowerCase());
}

function numEnv(key: string, def: number): number {
  const v = process.env[key];
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function listEnv(key: string): string[] {
  const v = process.env[key];
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export type AgentConfig = {
  repoRoot: string;
  artifactsDir: string;

  enableLLM: boolean;

  openai: {
    apiKey: string;
    model: string; // planning model
    patchModel: string; // patch model
  };

  guardrails: {
    maxFileBytes: number;
    maxOps: number;
    maxTotalWriteBytes: number;
    lockedPathPrefixes: string[];
    deniedPathPrefixes: string[];
  };

  discord: {
    token: string;
    clientId: string;
    guildId: string;
    channelId: string;
  };
};

export function loadConfig(): AgentConfig {
  const repoRoot = process.env.REPO_ROOT
    ? path.resolve(process.env.REPO_ROOT)
    : process.cwd();

  return {
    repoRoot,
    artifactsDir: process.env.AGENT_ARTIFACTS_DIR ?? "agent_artifacts",

    enableLLM: boolEnv("AGENT_ENABLE_LLM", false),

    openai: {
      apiKey: mustEnv("OPENAI_API_KEY"),
      model: process.env.OPENAI_MODEL?.trim() || "gpt-5-mini",
      patchModel: process.env.OPENAI_MODEL_PATCH?.trim() || "gpt-5",
    },

    guardrails: {
      maxFileBytes: numEnv("AGENT_MAX_FILE_BYTES", 25_000),
      maxOps: numEnv("AGENT_MAX_OPS", 20),
      maxTotalWriteBytes: numEnv("AGENT_MAX_WRITE_BYTES", 200_000),
      lockedPathPrefixes: listEnv("AGENT_LOCKED_PATHS"),
      deniedPathPrefixes: listEnv("AGENT_DENIED_PATHS"),
    },

    discord: {
      token: mustEnv("DISCORD_TOKEN"),
      clientId: mustEnv("DISCORD_CLIENT_ID"),
      guildId: mustEnv("DISCORD_GUILD_ID"),
      channelId: mustEnv("DISCORD_CHANNEL_ID"),
    },
  };
}
