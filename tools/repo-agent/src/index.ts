// tools/repo-agent/src/index.ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// ----------------------------------------------------
// Load .env from repo root
// ----------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// tools/repo-agent/src -> tools/repo-agent -> tools -> Project_Cardinal
const envPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: envPath });

console.log("[bootstrap] Loaded env from:", envPath);
// ----------------------------------------------------

import { loadConfig } from "./core/Config.js";
import { Agent } from "./core/Agent.js";
import { DiscordBot } from "./integrations/DiscordBot.js";

async function main() {
  const config = loadConfig();

  const agent = new Agent(config);
  const bot = new DiscordBot(agent);

  await bot.start(config.discord.token);
}

main().catch((err) => {
  console.error("[bootstrap] fatal error", err);
  process.exit(1);
});
