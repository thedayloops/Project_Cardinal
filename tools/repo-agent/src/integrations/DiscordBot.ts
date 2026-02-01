import {
  Client,
  GatewayIntentBits,
  Interaction,
  ChatInputCommandInteraction,
} from "discord.js";

import { Agent } from "../core/Agent.js";
import { agentMerge } from "../commands/agent_merge.js";
import { agentCleanup } from "../commands/agent_cleanup.js";

export class DiscordBot {
  private client: Client;
  private agent: Agent;

  constructor(agent: Agent) {
    this.agent = agent;
    this.client = new Client({ intents: [GatewayIntentBits.Guilds] });

    this.client.on("interactionCreate", (i) =>
      this.onInteraction(i).catch(console.error)
    );
  }

  async start(token: string) {
    await this.client.login(token);
  }

  private async onInteraction(interaction: Interaction) {
    if (!interaction.isChatInputCommand()) return;

    const i = interaction as ChatInputCommandInteraction;

    if (i.commandName === "agent_merge") {
      return agentMerge(i, this.agent);
    }

    if (i.commandName === "agent_cleanup") {
      return agentCleanup(i, this.agent);
    }
  }
}
