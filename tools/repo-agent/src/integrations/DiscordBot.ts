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

import fs from "node:fs/promises";

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

async function fileAttachmentFromPath(name: string, fileAbs: string) {
  const buf = await fs.readFile(fileAbs);
  return new AttachmentBuilder(buf, { name });
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

    if (interaction.commandName === "agent_merge") {
      await interaction.reply({ content: "Merging last agent branch…", ephemeral: true });
      try {
        const r = await this.agent.mergeLastAgentBranch();
        await interaction.editReply(`✅ Merged \`${r.mergedBranch}\` into \`main\``);
      } catch (err: any) {
        await interaction.editReply(`❌ Merge failed:\n${err?.message ?? String(err)}`);
      }
      return;
    }

    if (interaction.commandName === "agent_cleanup") {
      await interaction.reply({ content: "Cleaning up agent branches…", ephemeral: true });
      try {
        const r = await this.agent.cleanupAgentBranches();
        if (r.deleted.length === 0) {
          await interaction.editReply("Nothing to clean.");
          return;
        }
        await interaction.editReply(
          `🧹 Deleted branches:\n${r.deleted.map((b) => `• ${b}`).join("\n")}`
        );
      } catch (err: any) {
        await interaction.editReply(`❌ Cleanup failed:\n${err?.message ?? String(err)}`);
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
          ["Plan preview:", clipText(JSON.stringify(plan, null, 2), 1200)].join("\n"),
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

        const lines: string[] = [
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
        ];

        const files: AttachmentBuilder[] = [
          ...(plan ? [jsonAttachment(planFile, plan)] : []),
          textAttachment(diffFile, result.diffFull),
        ];

        if (result.verification) {
          const v = result.verification;
          if (v.ok) {
            lines.push("Verification: ✅ build passed (npm run build)");
          } else {
            lines.push(
              "Verification: ❌ build failed (npm run build)",
              "Merge is blocked until a verified self-improve branch exists.",
              "",
              "Build logs attached."
            );

            try {
              files.push(await fileAttachmentFromPath(`build_${planId}_stdout.log`, v.stdoutPath));
            } catch {}
            try {
              files.push(await fileAttachmentFromPath(`build_${planId}_stderr.log`, v.stderrPath));
            } catch {}
          }
        } else {
          lines.push("Verification: (not run)");
        }

        lines.push(
          "",
          "Push when ready:",
          `git push -u origin ${result.branch}`
        );

        const content = clipText(lines.join("\n"), SAFE_MAX_CONTENT);

        await interaction.editReply({
          content,
          files,
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
