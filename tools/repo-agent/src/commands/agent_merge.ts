import { SlashCommandBuilder } from "discord.js";
import type { CommandInteraction } from "discord.js";

import { Agent } from "../core/Agent.js";
import { loadConfig } from "../core/Config.js";

export const data = new SlashCommandBuilder()
  .setName("agent_merge")
  .setDescription("Merge the last agent branch into main");

export async function execute(interaction: CommandInteraction) {
  await interaction.deferReply();

  try {
    const cfg = await loadConfig();
    const agent = new Agent(cfg);

    const result = await agent.mergeLastAgentBranch();

    await interaction.editReply(
      `✅ Merged \`${result.mergedBranch}\` into \`main\``
    );
  } catch (err: any) {
    await interaction.editReply(`❌ Merge failed: ${err.message}`);
  }
}
