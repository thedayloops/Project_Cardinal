import "dotenv/config";

import { Agent } from "./core/Agent.js";
import { DiscordBot } from "./integrations/DiscordBot.js";
import { loadConfig } from "./core/Config.js";

async function main() {
  const cfg = loadConfig();
  const agent = new Agent(cfg);

  const bot = new DiscordBot(agent);
  await bot.start(process.env.DISCORD_TOKEN!);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
