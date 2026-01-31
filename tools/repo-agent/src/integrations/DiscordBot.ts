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

const CODE_FENCE = "```";

export class DiscordBot {
  private client: Client;
  private agent: Agent;
  private pendingPlanId: string | null = null;

  constructor(agent: Agent) {
    this.agent = agent;
    this.client = new Client({ intents: [GatewayIntentBits.Guilds] });

    this.client.on("interactionCreate", (i) =>
      this.onInteraction(i).catch((err) => console.error("[discord] interaction error", err))
    );
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

  private async handleSlash(interaction: ChatInputCommandInteraction) {
    if (interaction.commandName === "agent_status") {
      await interaction.reply({ content: "Checking agent status…", ephemeral: true });

      const status = await this.agent.getStatus();
      const json = JSON.stringify(status, null, 2);
      const clipped = json.length > 1800 ? json.slice(0, 1800) + "\n…TRUNCATED…" : json;

      await interaction.editReply({
        content: CODE_FENCE + "json\n" + clipped + "\n" + CODE_FENCE,
      });
      return;
    }

    if (interaction.commandName === "agent_tokens") {
      const ledger = await this.agent.getTokenStats();
      const json = JSON.stringify(ledger, null, 2);
      const clipped = json.length > 1800 ? json.slice(0, 1800) + "\n…TRUNCATED…" : json;

      await interaction.reply({
        content: CODE_FENCE + "json\n" + clipped + "\n" + CODE_FENCE,
        ephemeral: true,
      });
      return;
    }

    if (interaction.commandName === "agent_run") {
      const mode = interaction.options.getString("mode", true);
      const reason = interaction.options.getString("reason", false);

      await interaction.reply("Running agent…");

      try {
        const proposal = await this.agent.run(mode, reason ?? null);
        this.pendingPlanId = proposal.planId;

        const plan = proposal.patchPlan;
        const fullJson = JSON.stringify(plan, null, 2);

        const summary =
          `**Repo Agent Proposal**\n` +
          `PlanId: \`${proposal.planId}\`\n` +
          `Mode: \`${mode}\`\n` +
          `Reason: ${reason ?? "(none)"}\n` +
          `Files: ${plan.scope.files.length}\n` +
          `Ops: ${plan.scope.total_ops}\n` +
          `Estimated bytes: ${plan.scope.estimated_bytes_changed}\n`;

        const preview =
          fullJson.length > 1200 ? fullJson.slice(0, 1200) + "\n…TRUNCATED PREVIEW…" : fullJson;

        await interaction.editReply({
          content: summary + "\n" + CODE_FENCE + "json\n" + preview + "\n" + CODE_FENCE,
          files: [
            {
              attachment: Buffer.from(fullJson, "utf8"),
              name: `proposal-${proposal.planId}.json`,
            },
          ],
          components: [this.buildButtons()],
        });
      } catch (err: any) {
        await interaction.editReply(
          `❌ **Agent run failed**\n${CODE_FENCE}\n${err?.message ?? String(err)}\n${CODE_FENCE}`
        );
      }
      return;
    }

    if (interaction.commandName === "agent_explain") {
      const plan = this.agent.getLastPlan();
      if (!plan) {
        await interaction.reply({ content: "No plan to explain.", ephemeral: true });
        return;
      }

      const json = JSON.stringify(plan, null, 2);
      const chunks = json.match(/[\s\S]{1,1800}/g) ?? [];

      await interaction.reply({
        content:
          "📄 **Agent Plan Explanation (part 1)**\n" +
          CODE_FENCE +
          "json\n" +
          chunks[0] +
          "\n" +
          CODE_FENCE,
        ephemeral: true,
      });

      for (let i = 1; i < chunks.length; i++) {
        await interaction.followUp({
          content: `📄 **Part ${i + 1}**\n` + CODE_FENCE + "json\n" + chunks[i] + "\n" + CODE_FENCE,
          ephemeral: true,
        });
      }
      return;
    }
  }

  private async handleButton(interaction: Interaction) {
    if (!interaction.isButton()) return;

    if (interaction.customId === "agent_approve") {
      await interaction.reply({ content: "✅ Approved. Executing patch…", ephemeral: true });

      try {
        const result = await this.agent.executeApprovedPlan();

        const summary =
          `✅ **Patch executed**\n` +
          `PlanId: \`${result.planId}\`\n` +
          `Branch: \`${result.branch}\`\n` +
          `Commit: \`${result.commit}\`\n` +
          (result.filesChanged
            ? `\n**Files changed**\n${CODE_FENCE}text\n${result.filesChanged}\n${CODE_FENCE}\n`
            : "\n**Files changed**\n(none)\n") +
          `**Diff (snippet)**\n${CODE_FENCE}diff\n${result.diffSnippet}\n${CODE_FENCE}`;

        if (summary.length <= 1900) {
          await interaction.editReply({ content: summary });
        } else {
          await interaction.editReply({
            content:
              `✅ **Patch executed**\nPlanId: \`${result.planId}\`\nBranch: \`${result.branch}\`\nCommit: \`${result.commit}\`\n` +
              `(Diff too large for message — attached.)`,
            files: [
              {
                attachment: Buffer.from(result.diffFull, "utf8"),
                name: "diff_full.patch",
              },
            ],
          });
        }
      } catch (err: any) {
        await interaction.editReply(
          `❌ Execution failed\n${CODE_FENCE}\n${err?.message ?? String(err)}\n${CODE_FENCE}`
        );
      }
      return;
    }

    if (interaction.customId === "agent_reject") {
      this.agent.clearPendingPlan();
      this.pendingPlanId = null;
      await interaction.reply({ content: "❌ Proposal rejected.", ephemeral: true });
      return;
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
