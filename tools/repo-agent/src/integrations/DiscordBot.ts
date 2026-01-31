// tools/repo-agent/src/integrations/DiscordBot.ts
import {
  Client,
  GatewayIntentBits,
  ChatInputCommandInteraction,
  Interaction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";

import { Agent } from "../core/Agent.js";

const MAX_MESSAGE = 1800; // safety buffer under 2000

export class DiscordBot {
  private client: Client;
  private agent: Agent;
  private pendingPlanId: string | null = null;

  constructor(agent: Agent) {
    this.agent = agent;

    this.client = new Client({
      intents: [GatewayIntentBits.Guilds],
    });

    this.client.on("interactionCreate", (i) => {
      this.onInteraction(i).catch((err) => {
        console.error("[discord] interaction error", err);
      });
    });
  }

  async start(token: string) {
    await this.client.login(token);
    console.log("[discord] bot online");
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

  // ─────────────────────────────────────────────────────────────
  // Slash commands
  // ─────────────────────────────────────────────────────────────
  private async handleSlash(interaction: ChatInputCommandInteraction) {
    /* ---------------- agent_status ---------------- */
    if (interaction.commandName === "agent_status") {
      await interaction.reply({ content: "Checking agent status…", ephemeral: true });

      const status = await this.agent.getStatus();
      const json = JSON.stringify(status, null, 2);
      const clipped =
        json.length > MAX_MESSAGE
          ? json.slice(0, MAX_MESSAGE) + "\n…TRUNCATED…"
          : json;

      await interaction.editReply({
        content: "```json\n" + clipped + "\n```",
      });
      return;
    }

    /* ---------------- agent_tokens ---------------- */
    if (interaction.commandName === "agent_tokens") {
      await interaction.reply({ content: "Fetching token usage…", ephemeral: true });

      const stats = await this.agent.getTokenStats();
      const json = JSON.stringify(stats, null, 2);
      const clipped =
        json.length > MAX_MESSAGE
          ? json.slice(0, MAX_MESSAGE) + "\n…TRUNCATED…"
          : json;

      await interaction.editReply({
        content: "```json\n" + clipped + "\n```",
      });
      return;
    }

    /* ---------------- agent_run ---------------- */
    if (interaction.commandName === "agent_run") {
      const mode = interaction.options.getString("mode", true);
      const reason = interaction.options.getString("reason", false);

      await interaction.reply("Running agent…");

      try {
        const proposal = await this.agent.run(mode, reason ?? null);
        this.pendingPlanId = proposal?.planId ?? null;

        if (!proposal || !proposal.patchPlan) {
          await interaction.editReply(
            "⚠️ Agent completed with no changes.\nReason: planning disabled or no actionable changes found."
          );
          return;
        }

        const plan = proposal.patchPlan;
        const fullJson = JSON.stringify(plan, null, 2);

        const summary =
          `**Repo Agent Proposal**\n` +
          `PlanId: \`${proposal.planId ?? "unknown"}\`\n` +
          `Mode: \`${mode}\`\n` +
          `Reason: ${reason ?? "(none)"}\n` +
          `Files: ${plan.scope?.files?.length ?? 0}\n` +
          `Ops: ${plan.scope?.total_ops ?? 0}\n` +
          `Estimated bytes: ${plan.scope?.estimated_bytes_changed ?? 0}\n`;

        const preview =
          fullJson.length > 1200
            ? fullJson.slice(0, 1200) + "\n…TRUNCATED PREVIEW…"
            : fullJson;

        const file = {
          attachment: Buffer.from(fullJson, "utf8"),
          name: `proposal-${proposal.planId ?? Date.now()}.json`,
        };

        await interaction.editReply({
          content: summary + "\n```json\n" + preview + "\n```",
          files: [file],
          components: [this.buildButtons()],
        });
      } catch (err: any) {
        console.error("[agent_run] FAILED", err);
        await interaction.editReply(
          `❌ **Agent run failed**\n\`\`\`\n${err?.message ?? String(err)}\n\`\`\``
        );
      }
      return;
    }

    /* ---------------- agent_explain ---------------- */
    if (interaction.commandName === "agent_explain") {
      await interaction.reply({ content: "Explaining last agent decision…", ephemeral: true });

      const last = this.agent.getLastPlan();

      if (!last) {
        await interaction.editReply(
          "ℹ️ No agent run found yet. Use `/agent_run` first."
        );
        return;
      }

      const plan = last.patchPlan;
      const meta = plan?.meta ?? {};

      const explanation =
        `**Agent Explanation (Last Run)**\n\n` +
        `Goal:\n${meta.goal ?? "unknown"}\n\n` +
        `Why:\n${meta.rationale ?? "not provided"}\n\n` +
        `Confidence: ${meta.confidence ?? 0}`;

      const clipped =
        explanation.length > MAX_MESSAGE
          ? explanation.slice(0, MAX_MESSAGE) + "\n…TRUNCATED…"
          : explanation;

      const explainAttachment = {
        attachment: Buffer.from(
          JSON.stringify(
            {
              meta: plan.meta,
              expected_effects: plan.expected_effects,
              verification: plan.verification,
            },
            null,
            2
          ),
          "utf8"
        ),
        name: `agent-explain-summary_${last.planId ?? Date.now()}.json`,
      };

      const rawPlanAttachment = {
        attachment: Buffer.from(JSON.stringify(plan, null, 2), "utf8"),
        name: `agent-explain-plan_${last.planId ?? Date.now()}.json`,
      };

      await interaction.editReply({
        content: clipped,
        files: [explainAttachment, rawPlanAttachment],
      });
      return;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Buttons
  // ─────────────────────────────────────────────────────────────
  private async handleButton(interaction: Interaction) {
    if (!interaction.isButton()) return;

    if (!this.pendingPlanId) {
      await interaction.reply({
        content: "No pending proposal.",
        ephemeral: true,
      });
      return;
    }

    if (interaction.customId === "agent_approve") {
      await interaction.reply({
        content: "✅ Proposal approved (execution not wired yet).",
        ephemeral: true,
      });
      return;
    }

    if (interaction.customId === "agent_reject") {
      this.pendingPlanId = null;
      this.agent.clearPendingPlan();

      await interaction.reply({
        content: "❌ Proposal rejected.",
        ephemeral: true,
      });
      return;
    }
  }

  private buildButtons() {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("agent_approve")
        .setLabel("Approve")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("agent_reject")
        .setLabel("Reject")
        .setStyle(ButtonStyle.Danger)
    );
  }
}
