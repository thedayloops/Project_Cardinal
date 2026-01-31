import { REST, Routes, SlashCommandBuilder } from "discord.js";

export async function registerCommands(
  token: string,
  clientId: string,
  guildId?: string
) {
  const commands = [
    new SlashCommandBuilder()
      .setName("agent_run")
      .setDescription("Run the repository agent in a selected mode")
      .addStringOption((opt) =>
        opt
          .setName("mode")
          .setDescription("Execution mode")
          .setRequired(true)
          .addChoices(
            { name: "plan", value: "plan" },
            { name: "verify", value: "verify" },
            { name: "deep", value: "deep" },
            { name: "self_improve", value: "self_improve" }
          )
      )
      .addStringOption((opt) =>
        opt
          .setName("reason")
          .setDescription("Optional context or goal")
          .setRequired(false)
      )
      .toJSON(),

    new SlashCommandBuilder()
      .setName("agent_status")
      .setDescription("Show agent status")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("agent_tokens")
      .setDescription("Show agent token usage")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("agent_explain")
      .setDescription("Explain the last generated plan")
      .toJSON(),
  ];

  const rest = new REST({ version: "10" }).setToken(token);

  if (guildId) {
    console.log("Registering GUILD commands (fast refresh)...");
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );
  } else {
    console.log("Registering GLOBAL commands (can take up to 1 hour)...");
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands }
    );
  }

  console.log("Slash commands registered successfully.");
}
