// tools/repo-agent/src/index.ts

import "dotenv/config"; // MUST be first

import { loadConfig } from "./core/Config.js";
import { Agent } from "./core/Agent.js";
import { DiscordBot } from "./integrations/DiscordBot.js";

async function main() {
  const cfg = loadConfig();

  // ---- LLM SAFETY (do NOT mutate env, only runtime behavior) ----
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

  // ---- START DISCORD BOT ----
  const bot = new DiscordBot(agent);
  await bot.start(token);

  console.log("✅ Repo Agent initialized with Discord");
}

main().catch((err) => {
  console.error("❌ Fatal startup error");
  console.error(err);
  process.exit(1);
});
