// tools/repo-agent/src/integrations/DiscordBot.ts

import {
  Client,
  GatewayIntentBits,
  Interaction,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";

import { Agent } from "../core/Agent.js";
import { clipText, formatNameStatusList } from "../util/discordText.js";

const SAFE_MAX_CONTENT = 1900;

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
    if (interaction.isChatInputCommand()) {
      await this.handleSlash(interaction);
      return;
    }
    if (interaction.isButton()) {
      await this.handleButton(interaction);
      return;
    }
  }

  /* -------------------------------------------------- */
  /* SLASH COMMANDS                                     */
  /* -------------------------------------------------- */

  private async handleSlash(interaction: ChatInputCommandInteraction) {
    if (interaction.commandName === "agent_run") {
      const mode = interaction.options.getString("mode", true);
      const reason = interaction.options.getString("reason");

      await interaction.reply("Running agent…");

      try {
        const proposal = await this.agent.run(mode, reason ?? null);
        const plan = proposal.patchPlan;

        const body = clipText(
          [
            "Repo Agent Proposal",
            `PlanId: ${proposal.planId}`,
            `Mode: ${mode}`,
            `Goal: ${plan.meta?.goal ?? "(none)"}`,
            `Confidence: ${plan.meta?.confidence ?? 0}`,
            `Files: ${plan.scope?.files?.length ?? 0}`,
            `Ops: ${plan.ops?.length ?? 0}`,
          ].join("\n"),
          SAFE_MAX_CONTENT
        );

        await interaction.editReply({
          content: body,
          components: [this.buildButtons()],
        });
      } catch (err: any) {
        await interaction.editReply(
          "Agent failed:\n" + (err?.message ?? String(err))
        );
      }
      return;
    }

    if (interaction.commandName === "agent_status") {
      await interaction.reply({
        content: JSON.stringify(await this.agent.getStatus(), null, 2),
        ephemeral: true,
      });
      return;
    }

    if (interaction.commandName === "agent_tokens") {
      await interaction.reply({
        content: JSON.stringify(await this.agent.getTokenStats(), null, 2),
        ephemeral: true,
      });
      return;
    }
  }

  /* -------------------------------------------------- */
  /* BUTTON HANDLERS                                    */
  /* -------------------------------------------------- */

  private async handleButton(interaction: Interaction) {
    if (!interaction.isButton()) return;

    if (interaction.customId === "agent_approve") {
      await interaction.reply({
        content: "Executing approved plan…",
        ephemeral: true,
      });

      try {
        const result = await this.agent.executeApprovedPlan();

        const content = clipText(
          [
            "✅ Plan executed",
            "",
            `Branch: ${result.branch}`,
            `Commit: ${result.commit}`,
            "",
            "Files changed:",
            formatNameStatusList(result.filesChanged),
          ].join("\n"),
          SAFE_MAX_CONTENT
        );

        await interaction.editReply({ content });
      } catch (err: any) {
        await interaction.editReply(
          "❌ Execution failed:\n" + (err?.message ?? String(err))
        );
      }
      return;
    }

    if (interaction.customId === "agent_reject") {
      this.agent.clearPendingPlan();
      await interaction.reply({
        content: "Proposal rejected.",
        ephemeral: true,
      });
    }
  }

  /* -------------------------------------------------- */
  /* UI HELPERS                                         */
  /* -------------------------------------------------- */

  private buildButtons() {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("agent_approve")
        .setLabel("Approve & Execute")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("agent_reject")
        .setLabel("Reject")
        .setStyle(ButtonStyle.Danger)
    );
  }
}
