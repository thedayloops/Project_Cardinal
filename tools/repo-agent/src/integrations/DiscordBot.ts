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

const SAFE_MAX_CONTENT = 1900;

function jsonAttachment(name: string, obj: unknown) {
  return new AttachmentBuilder(
    Buffer.from(JSON.stringify(obj, null, 2), "utf8"),
    { name }
  );
}

function textAttachment(name: string, text: string) {
  return new AttachmentBuilder(Buffer.from(text ?? "", "utf8"), { name });
}

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

  private async handleSlash(interaction: ChatInputCommandInteraction) {
    if (interaction.commandName === "agent_run") {
      const mode = interaction.options.getString("mode", true);
      const reason = interaction.options.getString("reason");

      await interaction.reply("Running agent…");

      try {
        const proposal = await this.agent.run(mode, reason ?? null);
        const plan = proposal.patchPlan;

        const planFile = makeArtifactFileName("plan", proposal.planId, "json");

        const warning =
          mode === "self_improve"
            ? [
                "⚠️ **SELF-IMPROVE MODE**",
                "",
                "The agent is proposing changes to **its own code**:",
                "`tools/repo-agent/**`",
                "",
                "Rules still apply:",
                "- No commands removed",
                "- No auto-execution",
                "- Requires explicit approval",
                "",
                "Review carefully before approving.",
                "",
              ].join("\n")
            : "";

        const body = clipText(
          [
            warning,
            "Repo Agent Proposal",
            `PlanId: ${proposal.planId}`,
            `Mode: ${mode}`,
            `Goal: ${plan.meta?.goal ?? "(none)"}`,
            `Confidence: ${plan.meta?.confidence ?? 0}`,
            `Files: ${plan.scope?.files?.length ?? 0}`,
            `Ops: ${plan.ops?.length ?? 0}`,
            "",
            "Preview:",
            clipText(JSON.stringify(plan, null, 2), 800),
            "",
            `Full plan attached: ${planFile}`,
          ].join("\n"),
          SAFE_MAX_CONTENT
        );

        await interaction.editReply({
          content: body,
          components: [this.buildButtons()],
          files: [jsonAttachment(planFile, plan)],
        });
      } catch (err: any) {
        await interaction.editReply(
          "Agent failed:\n" + (err?.message ?? String(err))
        );
      }
      return;
    }

    if (interaction.commandName === "agent_explain") {
      const plan = this.agent.getLastPlan();
      const planId = this.agent.getPendingPlanId() ?? "unknown";

      if (!plan) {
        await interaction.reply({ content: "No plan available.", ephemeral: true });
        return;
      }

      const file = makeArtifactFileName("plan", planId, "json");

      await interaction.reply({
        content: clipText(
          ["Plan preview:", clipText(JSON.stringify(plan, null, 2), 1200)].join(
            "\n"
          ),
          SAFE_MAX_CONTENT
        ),
        files: [jsonAttachment(file, plan)],
        ephemeral: true,
      });
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

  private async handleButton(interaction: Interaction) {
    if (!interaction.isButton()) return;

    if (interaction.customId === "agent_approve") {
      await interaction.reply({
        content: "Executing approved plan…",
        ephemeral: true,
      });

      const plan = this.agent.getLastPlan();
      const planId = this.agent.getPendingPlanId() ?? "unknown";

      try {
        const result = await this.agent.executeApprovedPlan();

        const planFile = makeArtifactFileName("plan", planId, "json");
        const diffFile = makeArtifactFileName("diff", planId, "patch");

        const content = clipText(
          [
            "✅ Plan executed",
            "",
            `Branch: ${result.branch}`,
            `Commit: ${result.commit}`,
            "",
            "Files changed:",
            formatNameStatusList(result.filesChanged),
            "",
            "Diff preview:",
            toCodeBlock(clipText(result.diffSnippet, 900), "diff"),
            "",
            "Push when ready:",
            `git push -u origin ${result.branch}`,
          ].join("\n"),
          SAFE_MAX_CONTENT
        );

        await interaction.editReply({
          content,
          files: [
            plan ? jsonAttachment(planFile, plan) : undefined,
            textAttachment(diffFile, result.diffFull),
          ].filter(Boolean) as AttachmentBuilder[],
        });
      } catch (err: any) {
        await interaction.editReply(
          "❌ Execution failed:\n" + (err?.message ?? String(err))
        );
      }
      return;
    }

    if (interaction.customId === "agent_reject") {
      this.agent.clearPendingPlan();
      await interaction.reply({ content: "Proposal rejected.", ephemeral: true });
    }
  }

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
