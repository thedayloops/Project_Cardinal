// tools/repo-agent/src/commands/agent_cleanup.ts

import { ChatInputCommandInteraction } from "discord.js";
import { Agent } from "../core/Agent.js";

export async function agentCleanup(
  interaction: ChatInputCommandInteraction,
  agent: Agent
) {
  await interaction.reply({ content: "Cleaning up agent branches…", ephemeral: true });

  try {
    const result = await agent.cleanupAgentBranches();
    const deleted =
      result.deleted.length > 0 ? result.deleted.join("\n") : "(none)";

    await interaction.editReply(
      `🧹 Cleanup complete\nDeleted branches:\n${deleted}`
    );
  } catch (err: any) {
    await interaction.editReply(
      `❌ Cleanup failed:\n${err?.message ?? String(err)}`
    );
  }
}
