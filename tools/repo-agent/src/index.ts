// tools/repo-agent/src/index.ts
import dotenv from "dotenv";
import path from "node:path";

// Load .env from project root (two levels up)
dotenv.config({
  path: path.resolve(process.cwd(), "../../.env"),
});

import { REST, Routes } from "discord.js";
import { loadConfig } from "./core/Config.js";
import { Agent } from "./core/Agent.js";
import { DiscordBot } from "./integrations/DiscordBot.js";

async function main() {
  const config = loadConfig();

  console.log("[bootstrap] Loaded env from repo root");
  console.log("[bootstrap] Registering slash commands (guild-only)");

  const commands = [
    {
      name: "agent_run",
      description: "Run the repository agent",
      options: [
        {
          name: "mode",
          description: "Execution mode",
          type: 3, // STRING
          required: true,
          choices: [
            { name: "plan", value: "plan" },
            { name: "verify", value: "verify" },
            { name: "deep", value: "deep" }
          ]
        },
        {
          name: "reason",
          description: "Optional reason or goal",
          type: 3,
          required: false
        }
      ]
    },
    {
      name: "agent_status",
      description: "Show agent status"
    },
    {
      name: "agent_tokens",
      description: "Show OpenAI token usage"
    },
    {
      name: "agent_explain",
      description: "Explain the last agent plan in detail"
    }
  ];

  const rest = new REST({ version: "10" }).setToken(config.discord.token);

  await rest.put(
    Routes.applicationGuildCommands(
      config.discord.clientId,
      config.discord.guildId
    ),
    { body: commands }
  );

  console.log("[bootstrap] Slash commands registered");

  const agent = new Agent(config);
  const bot = new DiscordBot(agent);

  await bot.start(config.discord.token);
}

main().catch((err) => {
  console.error("[bootstrap] fatal error", err);
  process.exit(1);
});
