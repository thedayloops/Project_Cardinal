// tools/repo-agent/src/integrations/DiscordBot.ts
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
  Interaction,
} from "discord.js";

import type { Agent } from "../core/Agent.js";

type DiscordCfg = {
  token: string;
  clientId: string;
  guildId: string;
  channelId: string;
};

export class DiscordBot {
  private client: Client;
  private pendingPlanId: string | null = null;
  private lastMessageInteractionId: string | null = null;

  constructor(private cfg: DiscordCfg, private agent: Agent) {
    this.client = new Client({ intents: [GatewayIntentBits.Guilds] });
  }

  async start(): Promise<void> {
    await this.registerCommands();

    this.client.on("interactionCreate", async (i) => {
      try {
        if (i.isChatInputCommand()) {
          await this.handleSlash(i);
        } else if (i.isButton()) {
          await this.handleButton(i);
        }
      } catch (err: any) {
        // Always try to respond without crashing the bot
        const msg = `Error: ${err?.message ?? String(err)}`;
        if (i.isRepliable()) {
          if (i.deferred || i.replied) await i.editReply(msg);
          else await i.reply({ content: msg, ephemeral: true });
        }
      }
    });

    await this.client.login(this.cfg.token);
  }

  private async registerCommands() {
    const agentStatus = new SlashCommandBuilder()
      .setName("agent_status")
      .setDescription("Show repo-agent status (no OpenAI calls).");

    const agentRun = new SlashCommandBuilder()
      .setName("agent_run")
      .setDescription("Run the repo-agent planner (may use OpenAI).")
      .addStringOption((o) =>
        o
          .setName("mode")
          .setDescription("Run mode")
          .setRequired(true)
          .addChoices(
            { name: "scan", value: "scan" },
            { name: "plan", value: "plan" },
            { name: "verify", value: "verify" },
            { name: "deep", value: "deep" }
          )
      )
      .addStringOption((o) =>
        o
          .setName("reason")
          .setDescription("Optional intent for this run (recommended).")
          .setRequired(false)
      );

    const body = [agentStatus.toJSON(), agentRun.toJSON()];

    const rest = new REST({ version: "10" }).setToken(this.cfg.token);
    await rest.put(
      Routes.applicationGuildCommands(this.cfg.clientId, this.cfg.guildId),
      { body }
    );
  }

  private buildButtons(canMerge: boolean) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("agent_approve")
        .setLabel("Approve & Apply")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("agent_merge")
        .setLabel("Merge")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!canMerge),
      new ButtonBuilder()
        .setCustomId("agent_reject")
        .setLabel("Reject")
        .setStyle(ButtonStyle.Danger)
    );
  }

  private async handleSlash(interaction: ChatInputCommandInteraction) {
    if (interaction.commandName === "agent_status") {
      // Immediate reply (no defer) then edit if needed
      await interaction.reply({ content: "Checking status…", ephemeral: true });
      const status = await this.agent.getStatus();
      await interaction.editReply({
        content: "```json\n" + JSON.stringify(status, null, 2) + "\n```",
      });
      return;
    }

    if (interaction.commandName === "agent_run") {
      const mode = interaction.options.getString("mode", true);
      const reason = interaction.options.getString("reason", false);

      // User preference: don't defer; reply fast then edit
      await interaction.reply("Running agent…");

      const proposal = await this.agent.run(mode, reason ?? null);
      this.pendingPlanId = proposal.planId;
      this.lastMessageInteractionId = interaction.id;

      const planJson = JSON.stringify(proposal.patchPlan, null, 2);
      const clipped =
        planJson.length > 3500 ? planJson.slice(0, 3500) + "\n...TRUNCATED" : planJson;

      const header =
        `**Repo Agent Proposal**\n` +
        `PlanId: \`${proposal.planId}\`\n` +
        `Mode: \`${proposal.mode}\`\n` +
        (proposal.reason ? `Reason: ${proposal.reason}\n` : `Reason: (none)\n`);

      await interaction.editReply({
        content: header + "```json\n" + clipped + "\n```",
        components: [this.buildButtons(false)],
      });
      return;
    }
  }

  private async handleButton(interaction: Interaction) {
    if (!interaction.isButton()) return;
    if (!this.pendingPlanId) {
      await interaction.update({ content: "No pending plan.", components: [] });
      return;
    }

    if (interaction.customId === "agent_reject") {
      this.agent.rejectPending();
      this.pendingPlanId = null;
      await interaction.update({ content: "Rejected.", components: [] });
      return;
    }

    if (interaction.customId === "agent_approve") {
      await interaction.update({ content: "Applying in an agent branch…", components: [] });
      const res = await this.agent.approveAndApply(this.pendingPlanId);
      await interaction.editReply({
        content: `Applied on branch **${res.branch}** (commit ${res.commit}).\nClick **Merge** to merge into current branch.`,
        components: [this.buildButtons(true)],
      });
      return;
    }

    if (interaction.customId === "agent_merge") {
      await interaction.update({ content: "Merging…", components: [] });
      await this.agent.mergeLastApplied();
      this.pendingPlanId = null;
      await interaction.editReply({ content: "Merged.", components: [] });
      return;
    }
  }
}
