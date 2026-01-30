// tools/repo-agent/src/index.ts
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

import { loadConfig } from "./core/Config.js";
import { Agent } from "./core/Agent.js";
import { DiscordBot } from "./integrations/DiscordBot.js";

// Load .env by walking upward (monorepo-safe)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findEnv(start: string): string {
  let dir = start;
  while (true) {
    const candidate = path.join(dir, ".env");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("Could not locate .env");
    dir = parent;
  }
}

dotenv.config({ path: findEnv(__dirname) });

async function main() {
  const cfg = loadConfig();
  const agent = new Agent(cfg);

  const bot = new DiscordBot(
    {
      token: cfg.discord.token,
      clientId: cfg.discord.clientId,
      guildId: cfg.discord.guildId,
      channelId: cfg.discord.channelId,
    },
    agent
  );

  await bot.start();
  // eslint-disable-next-line no-console
  console.log("[repo-agent] online");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
