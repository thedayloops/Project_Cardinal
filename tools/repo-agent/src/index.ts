// tools/repo-agent/src/index.ts

import "dotenv/config"; // must be first

import { loadConfig } from "./core/Config.js";
import { Agent } from "./core/Agent.js";
import { DiscordBot } from "./integrations/DiscordBot.js";

async function main() {
  const cfg = loadConfig();

  // 🔧 LLM safety: do not crash if key is missing
  if (cfg.enableLLM && !cfg.openai.apiKey) {
    console.warn(
      "⚠️  OPENAI_API_KEY missing — disabling LLM features for this run"
    );
    cfg.enableLLM = false;
  }

  const agent = new Agent(cfg);

  const discordToken = process.env.DISCORD_TOKEN;

  if (discordToken) {
    const bot = new DiscordBot(agent);
    await bot.start(discordToken);
    console.log("✅ Discord bot started");
  } else {
    console.warn(
      "⚠️  DISCORD_TOKEN not set — running agent in headless mode"
    );
  }

  console.log("✅ Repo Agent initialized");
}

main().catch((err) => {
  console.error("❌ Fatal startup error");
  console.error(err);
  process.exit(1);
});
