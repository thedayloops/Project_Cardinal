import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Interaction
} from "discord.js";

import { Agent, AgentRunMode } from "../core/Agent.js";
import { Logger } from "../core/Logger.js";

export class DiscordBot {
  private client: Client;
  private pendingPlanId: string | null = null;

  constructor(
    private cfg: {
      token: string;
      clientId: string;
      guildId: string;
      channelId: string;
    },
    private agent: Agent,
    private log: Logger
  ) {
    this.client = new Client({ intents: [GatewayIntentBits.Guilds] });
  }

  async start(): Promise<void> {
    await this.registerCommands();

    this.client.on("interactionCreate", async (interaction) => {
      if (interaction.isChatInputCommand()) {
        await interaction.deferReply();
        await this.handleSlash(interaction);
      } else if (interaction.isButton()) {
        await this.handleButton(interaction);
      }
    });

    await this.client.login(this.cfg.token);
    this.log.info("Discord bot logged in");
  }

  private async registerCommands() {
    const commands = [
      new SlashCommandBuilder()
        .setName("agent_run")
        .setDescription("Run the repository agent")
        .addStringOption((o) =>
          o
            .setName("mode")
            .setDescription("How deeply the agent should analyze the repo")
            .addChoices(
              { name: "scan", value: "scan" },
              { name: "plan", value: "plan" },
              { name: "verify", value: "verify" },
              { name: "deep", value: "deep" }
            )
        )
    ].map((c) => c.toJSON());

    const rest = new REST({ version: "10" }).setToken(this.cfg.token);
    await rest.put(
      Routes.applicationGuildCommands(this.cfg.clientId, this.cfg.guildId),
      { body: commands }
    );

    this.log.info("Slash commands registered");
  }

  private async handleSlash(interaction: ChatInputCommandInteraction) {
    const mode = (interaction.options.getString("mode") as AgentRunMode) ?? "scan";

    await this.agent.trigger({
      kind: "discord",
      command: "agent_run",
      mode
    } as any);

    const proposal = this.agent.getLastProposal();
    if (!proposal) {
      await interaction.editReply("No proposal generated.");
      return;
    }

    this.pendingPlanId = proposal.planId;

    await interaction.editReply({
      content:
        `**Repo Agent Proposal**\n\n` +
        `Plan: ${proposal.plan}\n` +
        `Branch: ${proposal.branch}\n` +
        `Base: ${proposal.base}\n\n` +
        `**Summary**\n${proposal.summary}\n\n` +
        `**Verification**\n${proposal.verification}\n\n` +
        `**Diff (snippet)**\n\`\`\`\n${proposal.diffSnippet}\n\`\`\``,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("approve")
            .setLabel("Approve & Apply")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("merge")
            .setLabel("Merge")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("reject")
            .setLabel("Reject")
            .setStyle(ButtonStyle.Danger)
        )
      ]
    });
  }

  private async handleButton(interaction: Interaction) {
    if (!interaction.isButton() || !this.pendingPlanId) return;

    if (interaction.customId === "approve") {
      const res = await this.agent.executeApproval(this.pendingPlanId);
      await interaction.update({
        content: `Patch applied on branch **${res.branch}**`,
        components: []
      });
    }

    if (interaction.customId === "merge") {
      await this.agent.mergeLastExecution();
      this.pendingPlanId = null;
      await interaction.update({
        content: "Branch merged into base.",
        components: []
      });
    }

    if (interaction.customId === "reject") {
      this.pendingPlanId = null;
      await interaction.update({
        content: "Proposal rejected.",
        components: []
      });
    }
  }
}
