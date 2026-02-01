import { SlashCommandBuilder } from "discord.js";
import type { CommandInteraction } from "discord.js";

import { Agent } from "../core/Agent.js";
import { loadConfig } from "../core/Config.js";

export const data = new SlashCommandBuilder()
  .setName("agent_cleanup")
  .setDescription("Delete all local agent/* branches (keeps main)");

export async function execute(interaction: CommandInteraction) {
  await interaction.deferReply();

  try {
    const cfg = await loadConfig();
    const agent = new Agent(cfg);

    const result = await agent.cleanupAgentBranches();

    if (result.deleted.length === 0) {
      await interaction.editReply("🧹 No agent branches to delete.");
      return;
    }

    await interaction.editReply(
      `🧹 Deleted branches:\n` +
        result.deleted.map((b: string) => `• \`${b}\``).join("\n")
    );
  } catch (err: any) {
    await interaction.editReply(`❌ Cleanup failed: ${err.message}`);
  }
}
