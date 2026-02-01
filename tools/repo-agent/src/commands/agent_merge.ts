import type { ChatInputCommandInteraction } from "discord.js";
import { Agent } from "../core/Agent.js";

export async function agentMerge(
  interaction: ChatInputCommandInteraction,
  agent: Agent
) {
  await interaction.reply({ content: "Merging last agent branch…", ephemeral: true });

  try {
    const result = await agent.mergeLastAgentBranch();
    await interaction.editReply({
      content: `✅ Merged **${result.mergedBranch}** into main.`,
    });
  } catch (err) {
    await interaction.editReply({
      content:
        "❌ Merge failed:\n" +
        (err instanceof Error ? err.message : "Unknown error"),
    });
  }
}
