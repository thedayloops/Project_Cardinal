import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { Logger } from "./core/Logger.js";
import { loadConfig } from "./core/Config.js";
import { Agent } from "./core/Agent.js";
import { DiscordBot } from "./integrations/DiscordBot.js";

/**
 * Resolve __dirname in ESM
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Attempt to locate repo-root .env safely.
 * Priority:
 *  1. process.cwd()
 *  2. relative to this file (dist or src)
 */
function loadEnv(): void {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(__dirname, "../../../.env"),
    path.resolve(__dirname, "../../.env")
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      return;
    }
  }

  // Still call dotenv so it can report diagnostics
  dotenv.config();
}

loadEnv();

async function main(): Promise<void> {
  const log = new Logger();

  // Validate env + config AFTER dotenv
  const cfg = loadConfig();

  const agent = new Agent(
    {
      repoRoot: cfg.repoRoot,
      artifactsDir: cfg.artifactsDir,
      guardrails: cfg.guardrails,
      commandsAllowlist: cfg.commands.allowlist
    },
    log,
    {
      postProposal: async (proposal) => {
        log.info("Proposal generated", { planId: proposal.planId });
      }
    }
  );

  const discord = new DiscordBot(
    {
      token: cfg.discord.token,
      clientId: cfg.discord.clientId,
      guildId: cfg.discord.guildId,
      channelId: cfg.discord.channelId
    },
    agent,
    log
  );

  await discord.start();
  log.info("Repo agent started");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
