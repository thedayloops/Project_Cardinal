import path from "node:path";

export type AgentConfig = {
  repoRoot: string;
  artifactsDir: string;

  discord: {
    token: string;
    clientId: string;
    guildId: string;
    channelId: string;
  };

  openai: {
    apiKey: string;
    model: string;
  };

  guardrails: {
    // If plan touches these paths (prefix match or glob-like simple prefix), reject unless unlocked explicitly.
    lockedPathPrefixes: string[];
    // Hard denylist regardless of unlock.
    deniedPathPrefixes: string[];
    // Maximum total bytes across create/update contents.
    maxTotalWriteBytes: number;
    // Maximum number of file operations per plan.
    maxOps: number;
  };

  commands: {
    // Named commands the verifier is allowed to run.
    allowlist: Record<
      string,
      {
        cmd: string;
        args: string[];
        cwd?: string; // relative to repoRoot
      }
    >;
  };

  watch: {
    enabled: boolean;
    // Watch only these relative prefixes
    includePrefixes: string[];
    // Ignore patterns (substring match)
    ignoreSubstrings: string[];
    debounceMs: number;
  };
};

export function loadConfig(): AgentConfig {
  const repoRoot = process.env.REPO_ROOT
    ? path.resolve(process.env.REPO_ROOT)
    : path.resolve(process.cwd(), "../../"); // assumes tools/repo-agent is two levels below repo root

  const artifactsDir = path.join(repoRoot, "tools/repo-agent/agent_artifacts");

  const cfg: AgentConfig = {
    repoRoot,
    artifactsDir,
    discord: {
      token: mustEnv("DISCORD_TOKEN"),
      clientId: mustEnv("DISCORD_CLIENT_ID"),
      guildId: mustEnv("DISCORD_GUILD_ID"),
      channelId: mustEnv("DISCORD_CHANNEL_ID")
    },
    openai: {
      apiKey: mustEnv("OPENAI_API_KEY"),
      model: process.env.OPENAI_MODEL || "gpt-5-mini"
    },
    guardrails: {
      lockedPathPrefixes: [
        "package-lock.json",
        "pnpm-lock.yaml",
        "yarn.lock",
        ".github/",
        ".git/",
        ".env",
        "tools/repo-agent/agent_artifacts/"
      ],
      deniedPathPrefixes: [
        ".git/",
        ".env",
        "/",
        "\\",
        "node_modules/",
        "tools/repo-agent/agent_artifacts/"
      ],
      maxTotalWriteBytes: Number(process.env.AGENT_MAX_WRITE_BYTES ?? 300_000),
      maxOps: Number(process.env.AGENT_MAX_OPS ?? 25)
    },
    commands: {
      allowlist: {
        "tests:unit": { cmd: "npm", args: ["test"], cwd: "" },
        "build": { cmd: "npm", args: ["run", "build"], cwd: "" },
        "sim:smoke": { cmd: "node", args: ["dist/sim.js", "--ticks", "200"], cwd: "" }
      }
    },
    watch: {
      enabled: (process.env.AGENT_WATCH || "false") === "true",
      includePrefixes: ["src/", "sim/", "test/", "docs/"],
      ignoreSubstrings: ["/dist/", "agent_artifacts/", ".git/"],
      debounceMs: 1500
    }
  };

  return cfg;
}

function mustEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}
