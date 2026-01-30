// src/core/Config.ts

function mustEnv(key: string): string {
  const val = process.env[key];
  if (!val || val.trim() === "") {
    throw new Error(`Missing required env var: ${key}`);
  }
  return val;
}

export type AgentConfig = {
  repoRoot: string;
  artifactsDir: string;

  guardrails: {
    lockedPathPrefixes: string[];
    deniedPathPrefixes: string[];
    maxTotalWriteBytes: number;
    maxOps: number;
  };

  discord: {
    token: string;
    clientId: string;
    guildId: string;
    channelId: string;
  };
};

export function loadConfig(): AgentConfig {
  return {
    repoRoot: process.cwd(),

    artifactsDir: process.env.AGENT_ARTIFACTS_DIR ?? "agent_artifacts",

    guardrails: {
      lockedPathPrefixes:
        process.env.AGENT_LOCKED_PATHS?.split(",").filter(Boolean) ?? [],
      deniedPathPrefixes:
        process.env.AGENT_DENIED_PATHS?.split(",").filter(Boolean) ?? [],
      maxTotalWriteBytes: Number(
        process.env.AGENT_MAX_WRITE_BYTES ?? 200_000
      ),
      maxOps: Number(process.env.AGENT_MAX_OPS ?? 20)
    },

    discord: {
      token: mustEnv("DISCORD_TOKEN"),
      clientId: mustEnv("DISCORD_CLIENT_ID"),
      guildId: mustEnv("DISCORD_GUILD_ID"),
      channelId: mustEnv("DISCORD_CHANNEL_ID")
    }
  };
}
