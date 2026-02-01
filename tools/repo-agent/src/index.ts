// tools/repo-agent/src/index.ts

import "dotenv/config";
import { loadConfig } from "./core/Config.js";
import { Agent } from "./core/Agent.js";
import { DiscordBot } from "./integrations/DiscordBot.js";

async function main() {
  const cfg = loadConfig();

  if (cfg.enableLLM && !cfg.openai.apiKey) {
    console.warn("⚠️  OPENAI_API_KEY missing — disabling LLM features for this run");
    cfg.enableLLM = false;
  }

  const agent = new Agent(cfg);

  if (!process.env.DISCORD_TOKEN) {
    console.warn("⚠️  DISCORD_TOKEN not set — running agent in headless mode");
    console.log("✅ Repo Agent initialized");
    return;
  }

  const bot = new DiscordBot(agent);
  await bot.start(process.env.DISCORD_TOKEN);

  console.log("✅ Repo Agent + Discord bot running");
}

main().catch((err) => {
  console.error("❌ Fatal startup error");
  console.error(err);
  process.exit(1);
});
