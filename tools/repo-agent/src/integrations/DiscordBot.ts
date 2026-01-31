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

export class DiscordBot {
  private client: Client;
  private agent: Agent;
  private pendingPlanId: string | null = null;

  constructor(agent: Agent) {
    this.agent = agent;
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds],
    });

    this.client.on("interactionCreate", (i) =>
      this.onInteraction(i).catch(console.error)
    );
  }

  async start(token: string) {
    await this.client.login(token);
    console.log("[discord] bot online");
  }

  private async onInteraction(interaction: Interaction) {
    if (interaction.isChatInputCommand()) {
      await this.handleSlash(interaction);
    } else if (interaction.isButton()) {
      await this.handleButton(interaction);
    }
  }

  private async handleSlash(interaction: ChatInputCommandInteraction) {
    // ---------------- STATUS ----------------
    if (interaction.commandName === "agent_status") {
      await interaction.reply({ content: "Checking agent status…", ephemeral: true });

      const status = await this.agent.getStatus();
      const json = JSON.stringify(status, null, 2);
      const clipped =
        json.length > 1800 ? json.slice(0, 1800) + "\n…TRUNCATED…" : json;

      await interaction.editReply({
        content: "```json\n" + clipped + "\n```",
      });
      return;
    }

    // ---------------- TOKENS ----------------
    if (interaction.commandName === "agent_tokens") {
      const ledger = await this.agent.getTokenStats();
      const json = JSON.stringify(ledger, null, 2);

      await interaction.reply({
        content:
          "```json\n" +
          (json.length > 1800 ? json.slice(0, 1800) + "\n…TRUNCATED…" : json) +
          "\n```",
        ephemeral: true,
      });
      return;
    }

    // ---------------- RUN ----------------
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
          fullJson.length > 1200
            ? fullJson.slice(0, 1200) + "\n…TRUNCATED PREVIEW…"
            : fullJson;

        await interaction.editReply({
          content: summary + "\n```json\n" + preview + "\n```",
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
          `❌ **Agent run failed**\n\`\`\`\n${err?.message ?? String(err)}\n\`\`\``
        );
      }
      return;
    }

    // ---------------- EXPLAIN ----------------
    if (interaction.commandName === "agent_explain") {
      const plan = this.agent.getLastPlan();
      if (!plan) {
        await interaction.reply({ content: "No plan to explain.", ephemeral: true });
        return;
      }

      const json = JSON.stringify(plan, null, 2);
      const chunks = json.match(/[\s\S]{1,1900}/g) ?? [];

      await interaction.reply({
        content: "📄 **Agent Plan Explanation (part 1)**\n```json\n" + chunks[0] + "\n```",
        ephemeral: true,
      });

      for (let i = 1; i < chunks.length; i++) {
        await interaction.followUp({
          content: `📄 **Part ${i + 1}**\n```json\n${chunks[i]}\n````,
          ephemeral: true,
        });
      }
    }
  }

  private async handleButton(interaction: Interaction) {
    if (!interaction.isButton()) return;

    if (interaction.customId === "agent_approve") {
      await interaction.reply({ content: "✅ Proposal approved.", ephemeral: true });
      return;
    }

    if (interaction.customId === "agent_reject") {
      this.agent.clearPendingPlan();
      this.pendingPlanId = null;

      await interaction.reply({ content: "❌ Proposal rejected.", ephemeral: true });
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
