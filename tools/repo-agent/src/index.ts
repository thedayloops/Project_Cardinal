// tools/repo-agent/src/index.ts

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Resolve repo root (two levels up from this file)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// tools/repo-agent/dist/index.js → tools/repo-agent/dist → tools/repo-agent → PROJECT ROOT
const repoRoot = path.resolve(__dirname, "../../");

// Explicitly load root .env
dotenv.config({ path: path.join(repoRoot, ".env") });

import { loadConfig } from "./core/Config.js";
import { Agent } from "./core/Agent.js";
import { DiscordBot } from "./integrations/DiscordBot.js";

async function main() {
  const cfg = loadConfig();

  // 🔐 LLM safety
  if (cfg.enableLLM && !cfg.openai.apiKey) {
    console.warn(
      "⚠️  OPENAI_API_KEY missing — disabling LLM features for this run"
    );
    cfg.enableLLM = false;
  }

  const agent = new Agent(cfg);

  const discordToken = process.env.DISCORD_TOKEN;

  if (discordToken && discordToken !== "(omitted)") {
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
