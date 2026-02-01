import type { ChatInputCommandInteraction } from "discord.js";
import { Agent } from "../core/Agent.js";

export async function agentCleanup(
  interaction: ChatInputCommandInteraction,
  agent: Agent
) {
  await interaction.reply({ content: "Cleaning up agent branches…", ephemeral: true });

  try {
    const result = await agent.cleanupAgentBranches();
    const deleted: string[] = result.deleted;

    const msg =
      deleted.length === 0
        ? "No agent branches found."
        : "Deleted branches:\n" + deleted.map((b) => `• ${b}`).join("\n");

    await interaction.editReply({ content: msg });
  } catch (err) {
    await interaction.editReply({
      content:
        "❌ Cleanup failed:\n" +
        (err instanceof Error ? err.message : "Unknown error"),
    });
  }
}
