// tools/repo-agent/src/commands/agent_merge.ts

import { ChatInputCommandInteraction } from "discord.js";
import { Agent } from "../core/Agent.js";

export async function agentMerge(
  interaction: ChatInputCommandInteraction,
  agent: Agent
) {
  await interaction.reply({ content: "Merging agent branch…", ephemeral: true });

  try {
    const result = await agent.mergeLastAgentBranch();
    await interaction.editReply(
      `✅ Merge complete\nMerged branch: ${result.mergedBranch}`
    );
  } catch (err: any) {
    await interaction.editReply(
      `❌ Merge failed:\n${err?.message ?? String(err)}`
    );
  }
}
