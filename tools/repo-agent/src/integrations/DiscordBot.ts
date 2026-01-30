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
import { Logger } from "../core/Logger.js";
import { Agent, AgentRunMode, AgentProposal } from "../core/Agent.js";
import { loadLedger } from "../util/tokenLedger.js";

export class DiscordBot {
  private client: Client;
  private pendingProposal: AgentProposal | null = null;

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
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds]
    });
  }

  async start(): Promise<void> {
    await this.registerCommands();

    this.client.on("interactionCreate", async (interaction) => {
      if (interaction.isChatInputCommand()) {
        await interaction.deferReply({ ephemeral: false });
        await this.handleSlash(interaction);
        return;
      }

      if (interaction.isButton()) {
        await this.handleButton(interaction);
      }
    });

    await this.client.login(this.cfg.token);
    this.log.info("Discord bot logged in");
  }

  private async registerCommands(): Promise<void> {
    const commands = [
      new SlashCommandBuilder()
        .setName("agent_status")
        .setDescription("Show repo agent status"),

      new SlashCommandBuilder()
        .setName("agent_run")
        .setDescription("Run the repo agent")
        .addStringOption((opt) =>
          opt
            .setName("mode")
            .setDescription("Run mode")
            .addChoices(
              { name: "dry-run", value: "dry-run" },
              { name: "plan", value: "plan" },
              { name: "plan+verify", value: "plan+verify" }
            )
        ),

      new SlashCommandBuilder()
        .setName("agent_explain")
        .setDescription("Explain the last agent proposal"),

      new SlashCommandBuilder()
        .setName("agent_tokens")
        .setDescription("Show exact LLM token usage")
    ].map((c) => c.toJSON());

    const rest = new REST({ version: "10" }).setToken(this.cfg.token);
    await rest.put(
      Routes.applicationGuildCommands(this.cfg.clientId, this.cfg.guildId),
      { body: commands }
    );
  }

  private async handleSlash(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    switch (interaction.commandName) {
      case "agent_tokens": {
        const ledger = await loadLedger("agent_artifacts");

        const maxCalls = Number(
          process.env.AGENT_MAX_LLM_CALLS_PER_DAY ?? 50
        );

        await interaction.editReply(
          `**LLM Token Usage (Today)**\n\n` +
            `• Calls: ${ledger.calls} / ${maxCalls}\n` +
            `• Input tokens: ${ledger.tokens.input}\n` +
            `• Output tokens: ${ledger.tokens.output}\n` +
            `• Total tokens: ${ledger.tokens.total}\n\n` +
            `• Avg tokens/call: ${
              ledger.calls > 0
                ? Math.round(ledger.tokens.total / ledger.calls)
                : 0
            }`
        );
        return;
      }

      case "agent_status": {
        const s = this.agent.getStatus();
        await interaction.editReply(
          `**Repo Agent Status**\n\n` +
            `• Busy: ${s.busy ? "yes" : "no"}\n` +
            `• Pending proposal: ${
              s.pendingProposal
                ? `${s.pendingProposal.plan} (${s.pendingProposal.planId})`
                : "no"
            }\n` +
            `• Planner: ${s.planner}\n` +
            `• Write phase: DISABLED`
        );
        return;
      }

      case "agent_run": {
        const mode =
          (interaction.options.getString("mode") as AgentRunMode) ??
          "dry-run";

        await this.agent.trigger({
          kind: "discord",
          command: "agent_run",
          mode
        });

        const proposal = this.agent.getLastProposal();
        if (!proposal) {
          await interaction.editReply("No proposal generated.");
          return;
        }

        this.pendingProposal = proposal;

        await interaction.editReply({
          content: this.renderProposal(proposal),
          components: [this.buildButtons()]
        });
        return;
      }

      case "agent_explain": {
        await interaction.editReply(
          this.agent.getLastSummary() ??
            "No agent proposal has been generated yet."
        );
        return;
      }
    }
  }

  private async handleButton(interaction: Interaction): Promise<void> {
    if (!interaction.isButton()) return;

    if (!this.pendingProposal) {
      await interaction.reply({
        content: "No pending proposal.",
        ephemeral: true
      });
      return;
    }

    if (interaction.customId === "agent_approve") {
      await interaction.update({
        content:
          "✅ Proposal approved.\n(No merge executed — write phase disabled.)",
        components: []
      });
      this.pendingProposal = null;
      return;
    }

    if (interaction.customId === "agent_reject") {
      await interaction.update({
        content: "❌ Proposal rejected.",
        components: []
      });
      this.pendingProposal = null;
      return;
    }
  }

  private buildButtons() {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("agent_approve")
        .setLabel("Approve & Merge")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("agent_reject")
        .setLabel("Reject")
        .setStyle(ButtonStyle.Danger)
    );
  }

  private renderProposal(p: AgentProposal): string {
    return (
      `**Repo Agent Proposal**\n` +
      `Plan: ${p.plan}\n` +
      `Branch: ${p.branch}\n` +
      `Base: ${p.base} (HEAD before: ${p.headBefore})\n\n` +
      `**Summary**\n${p.summary}\n\n` +
      `**Verification**\n${p.verification}\n\n` +
      `**Diff (snippet)**\n${p.diffSnippet}`
    );
  }
}
