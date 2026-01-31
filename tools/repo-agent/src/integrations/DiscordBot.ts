// tools/repo-agent/src/integrations/DiscordBot.ts

import {
  Client,
  GatewayIntentBits,
  Interaction,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} from "discord.js";

import { Agent } from "../core/Agent.js";
import { clipText, formatNameStatusList, toCodeBlock } from "../util/discordText.js";
import { makeArtifactFileName } from "../util/artifactsDir.js";

const DISCORD_MAX_CONTENT = 2000;
// Keep some headroom for safety (code fences, extra lines, etc.)
const SAFE_MAX_CONTENT = 1900;

function asJsonAttachment(name: string, obj: unknown): AttachmentBuilder {
  const json = JSON.stringify(obj, null, 2);
  return new AttachmentBuilder(Buffer.from(json, "utf8"), { name });
}

function asTextAttachment(name: string, text: string): AttachmentBuilder {
  return new AttachmentBuilder(Buffer.from(text ?? "", "utf8"), { name });
}

export class DiscordBot {
  private client: Client;
  private agent: Agent;

  constructor(agent: Agent) {
    this.agent = agent;

    this.client = new Client({
      intents: [GatewayIntentBits.Guilds],
    });

    this.client.on("interactionCreate", (interaction) => {
      this.onInteraction(interaction).catch(console.error);
    });
  }

  async start(token: string) {
    await this.client.login(token);
    console.log("[discord] bot online");
  }

  // -----------------------------
  // Interaction router
  // -----------------------------
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

  // -----------------------------
  // Slash commands
  // -----------------------------
  private async handleSlash(interaction: ChatInputCommandInteraction) {
    if (interaction.commandName === "agent_status") {
      const status = await this.agent.getStatus();
      await interaction.reply({
        content: JSON.stringify(status, null, 2),
        ephemeral: true,
      });
      return;
    }

    if (interaction.commandName === "agent_tokens") {
      const ledger = await this.agent.getTokenStats();
      await interaction.reply({
        content: JSON.stringify(ledger, null, 2),
        ephemeral: true,
      });
      return;
    }

    if (interaction.commandName === "agent_run") {
      const mode = interaction.options.getString("mode", true);
      const reason = interaction.options.getString("reason");

      await interaction.reply("Running agent...");

      try {
        const proposal = await this.agent.run(mode, reason ?? null);
        const plan = proposal.patchPlan;

        // Attach full plan JSON so we never hit the 2000-char limit.
        const planFileName = makeArtifactFileName("plan", proposal.planId, "json");
        const planAttachment = asJsonAttachment(planFileName, plan);

        const summaryLines = [
          "Repo Agent Proposal",
          "PlanId: " + proposal.planId,
          "Mode: " + mode,
          "Goal: " + (plan.meta?.goal ?? "(none)"),
          "Confidence: " + String(plan.meta?.confidence ?? 0),
          "Files: " + String(plan.scope?.files?.length ?? 0),
          "Ops: " + String(plan.scope?.total_ops ?? plan.ops?.length ?? 0),
          "Estimated bytes: " + String(plan.scope?.estimated_bytes_changed ?? 0),
          "",
          "Preview:",
          clipText(JSON.stringify(plan, null, 2), 800),
          "",
          "Full plan attached as: " + planFileName,
        ];

        const content = clipText(summaryLines.join("\n"), SAFE_MAX_CONTENT);

        await interaction.editReply({
          content,
          components: [this.buildButtons()],
          files: [planAttachment],
        });
      } catch (err: any) {
        await interaction.editReply("Agent run failed:\n" + (err?.message ?? String(err)));
      }
      return;
    }

    if (interaction.commandName === "agent_explain") {
      const plan = this.agent.getLastPlan();
      const planId = this.agent.getPendingPlanId() ?? "unknown";

      if (!plan) {
        await interaction.reply({
          content: "No plan to explain.",
          ephemeral: true,
        });
        return;
      }

      const fileName = makeArtifactFileName("plan", planId, "json");
      const attachment = asJsonAttachment(fileName, plan);

      const preview = clipText(JSON.stringify(plan, null, 2), 1200);
      const content = clipText(
        ["Repo Agent Plan", "PlanId: " + planId, "", "Preview:", preview, "", "Full plan attached as: " + fileName].join(
          "\n"
        ),
        SAFE_MAX_CONTENT
      );

      try {
        await interaction.reply({
          content,
          files: [attachment],
          ephemeral: true,
        });
      } catch {
        // Fallback: chunking if attachments fail (rare)
        const json = JSON.stringify(plan, null, 2);
        const chunks: string[] = [];
        for (let i = 0; i < json.length; i += 1800) chunks.push(json.slice(i, i + 1800));

        await interaction.reply({ content: chunks[0], ephemeral: true });
        for (let i = 1; i < chunks.length; i++) {
          await interaction.followUp({ content: chunks[i], ephemeral: true });
        }
      }
      return;
    }
  }

  // -----------------------------
  // Button handling
  // -----------------------------
  private async handleButton(interaction: Interaction) {
    if (!interaction.isButton()) return;

    if (interaction.customId === "agent_approve") {
      // Respect user's preference: do NOT defer; reply immediately and edit.
      await interaction.reply({ content: "Executing approved plan...", ephemeral: true });

      // Capture the plan for attachments BEFORE execution clears it.
      const plan = this.agent.getLastPlan();
      const planId = this.agent.getPendingPlanId() ?? "unknown";

      try {
        const result = await this.agent.executeApprovedPlan();

        const planFileName = makeArtifactFileName("plan", result.planId, "json");
        const diffFileName = makeArtifactFileName("diff", result.planId, "patch");

        const attachments: AttachmentBuilder[] = [];

        if (plan) attachments.push(asJsonAttachment(planFileName, plan));
        attachments.push(asTextAttachment(diffFileName, result.diffFull));

        const filesBlock = formatNameStatusList(result.filesChanged, 40);

        const preview = clipText(result.diffSnippet ?? "", 900);
        const previewBlock = toCodeBlock(preview, "diff");

        const lines = [
          "✅ Agent plan executed",
          "",
          "Branch: " + result.branch,
          "Commit: " + result.commit,
          "",
          "Files changed:",
          filesBlock,
          "",
          "Diff preview:",
          previewBlock,
          "",
          "ℹ️ This branch exists locally. Push to GitHub with:",
          "git push -u origin " + result.branch,
          "",
          "Attachments:",
          plan ? `- ${planFileName}` : "- (plan attachment unavailable)",
          `- ${diffFileName}`,
        ];

        const content = clipText(lines.join("\n"), SAFE_MAX_CONTENT);

        await interaction.editReply({
          content,
          files: attachments,
        });
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        const content = clipText(
          [
            "❌ Execution failed",
            "",
            msg,
            "",
            "If this says the plan produced no changes, it likely wrote identical content or the patch context did not match.",
          ].join("\n"),
          SAFE_MAX_CONTENT
        );
        await interaction.editReply({ content });
      }
      return;
    }

    if (interaction.customId === "agent_reject") {
      this.agent.clearPendingPlan();
      await interaction.reply({
        content: "Proposal rejected.",
        ephemeral: true,
      });
      return;
    }
  }

  private buildButtons() {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("agent_approve")
        .setLabel("Approve & Execute")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("agent_reject")
        .setLabel("Reject")
        .setStyle(ButtonStyle.Danger)
    );

    return row;
  }
}
