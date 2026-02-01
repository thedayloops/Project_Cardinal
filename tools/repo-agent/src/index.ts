// tools/repo-agent/src/index.ts

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// ---------------------------------------------
// EXPLICITLY LOAD .env FROM PROJECT ROOT
// ---------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// repo-agent lives at: <root>/tools/repo-agent/
// so project root is two levels up
const projectRoot = path.resolve(__dirname, "../../..");

dotenv.config({
  path: path.join(projectRoot, ".env"),
});

// ---------------------------------------------

import { loadConfig } from "./core/Config.js";
import { Agent } from "./core/Agent.js";
import { DiscordBot } from "./integrations/DiscordBot.js";

async function main() {
  const cfg = loadConfig();

  // ---- LLM SAFETY (runtime only, no env mutation) ----
  if (cfg.enableLLM && !cfg.openai.apiKey) {
    console.warn(
      "⚠️  OPENAI_API_KEY missing — disabling LLM features for this run"
    );
    cfg.enableLLM = false;
  }

  // ---- INIT AGENT ----
  const agent = new Agent(cfg);

  // ---- DISCORD MODE ----
  const token = process.env.DISCORD_TOKEN;

  if (!token) {
    console.warn(
      "⚠️  DISCORD_TOKEN not set — running agent in headless mode"
    );
    console.log("✅ Repo Agent initialized");
    return;
  }

  const bot = new DiscordBot(agent);
  await bot.start(token);

  console.log("✅ Repo Agent initialized with Discord");
}

main().catch((err) => {
  console.error("❌ Fatal startup error");
  console.error(err);
  process.exit(1);
});
