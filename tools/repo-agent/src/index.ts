// tools/repo-agent/src/index.ts

import "dotenv/config"; // MUST be first

import { loadConfig } from "./core/Config.js";
import { Agent } from "./core/Agent.js";
import { DiscordBot } from "./integrations/DiscordBot.js";

async function main() {
  const cfg = loadConfig();

  // 🔧 HARDENED: never hard-crash on missing OpenAI key
  if (cfg.enableLLM && !cfg.openai.apiKey) {
    console.warn(
      "⚠️  OPENAI_API_KEY missing — disabling LLM features for this run"
    );
    cfg.enableLLM = false;
  }

  const agent = new Agent(cfg);

  const discordToken = process.env.DISCORD_TOKEN;
  if (!discordToken) {
    throw new Error("DISCORD_TOKEN is required to start the Discord bot");
  }

  const bot = new DiscordBot(agent);
  await bot.start(discordToken);

  console.log("✅ Repo Agent started");
}

main().catch((err) => {
  console.error("❌ Fatal startup error");
  console.error(err);
  process.exit(1);
});
