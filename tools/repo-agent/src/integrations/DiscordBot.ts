// tools/repo-agent/src/integrations/DiscordBot.ts
import {
  Client,
  GatewayIntentBits,
  Interaction,
} from "discord.js";
import { Agent } from "../core/Agent.js";

export class DiscordBot {
  private client: Client;
  private agent: Agent;

  constructor(agent: Agent, token: string) {
    this.agent = agent;

    this.client = new Client({
      intents: [GatewayIntentBits.Guilds],
    });

    this.client.on("interactionCreate", (i) => {
      if (!i.isChatInputCommand()) return;
      this.handleSlash(i).catch(console.error);
    });

    this.client.login(token);
  }

  async start(): Promise<void> {
    console.log("[discord] bot started");
  }

  private async handleSlash(interaction: Interaction) {
    if (!interaction.isChatInputCommand()) return;

    switch (interaction.commandName) {
      case "agent_status":
        await interaction.reply({
          content: this.agent.getStatus(),
          ephemeral: true,
        });
        break;

      case "agent_run": {
        const reason =
          interaction.options.getString("reason") ?? undefined;

        await interaction.reply({
          content: "Running agent…",
          ephemeral: true,
        });

        const result = await this.agent.run({
          reason,
        });

        await interaction.editReply({
          content: result,
        });
        break;
      }
    }
  }
}
