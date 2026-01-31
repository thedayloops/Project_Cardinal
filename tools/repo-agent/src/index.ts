import path from "node:path";
import dotenv from "dotenv";

// -----------------------------------------------------------------------------
// Explicitly load ROOT .env (repo-agent runs from tools/repo-agent)
// -----------------------------------------------------------------------------
dotenv.config({
  path: path.resolve(process.cwd(), "../../.env"),
});

import { loadConfig } from "./core/Config.js";
import { Agent } from "./core/Agent.js";
import { DiscordBot } from "./integrations/DiscordBot.js";
import { registerCommands } from "./integrations/registerCommands.js";

async function main() {
  const cfg = loadConfig();

  const discordToken = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID; // guild registration = instant updates

  if (!discordToken) throw new Error("DISCORD_TOKEN is not set");
  if (!clientId) throw new Error("DISCORD_CLIENT_ID is not set");

  // ---------------------------------------------------------------------------
  // ALWAYS register slash commands on startup
  // This guarantees new options (like self_improve) appear immediately
  // ---------------------------------------------------------------------------
  await registerCommands(discordToken, clientId, guildId);

  const agent = new Agent(cfg);
  const bot = new DiscordBot(agent);

  await bot.start(discordToken);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
