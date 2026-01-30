import dotenv from "dotenv";
import path from "node:path";

dotenv.config({
  path: path.resolve(process.cwd(), "../../.env")
});

import chokidar from "chokidar";
import { loadConfig } from "./core/Config.js";
import { Logger } from "./core/Logger.js";
import { Agent } from "./core/Agent.js";
import { DiscordBot } from "./integrations/DiscordBot.js";
import { GitService } from "./core/GitService.js";

const log = new Logger();
const cfg = loadConfig();

const git = new GitService(cfg.repoRoot);

const agent = new Agent(
  {
    repoRoot: cfg.repoRoot,
    artifactsDir: cfg.artifactsDir,
    guardrails: cfg.guardrails,
    commandsAllowlist: cfg.commands.allowlist
  },
  log,
  {
    postProposal: async (p) => discord.postProposal(p)
  }
);


const discord = new DiscordBot(
  {
    token: cfg.discord.token,
    clientId: cfg.discord.clientId,
    guildId: cfg.discord.guildId,
    channelId: cfg.discord.channelId,
    artifactsDir: cfg.artifactsDir
  },
  {
    onCommand: async (interaction) => {
      const name = interaction.commandName;

      if (name === "agent_status") {
        const status = await git.statusSummary();
        await discord.reply(interaction, `Agent OK\nRepo: ${cfg.repoRoot}\n${status}`);
        return;
      }

      if (name === "agent_run") {
        const mode = interaction.options.getString("mode") || "plan";
        await discord.reply(interaction, `Running agent (${mode})...`);
        await agent.trigger({ kind: "discord", command: "agent_run", args: { mode } });
        await discord.reply(interaction, `Agent run submitted. Check proposals in the channel.`);
        return;
      }

      await discord.reply(interaction, `Unknown command: ${name}`);
    },

    onApprove: async (planId, interaction) => {
      const pending = await discord.loadPending(planId);
      if (!pending) {
        await discord.editButtonResponse(interaction, `Could not find pending proposal for ${planId}`);
        return;
      }

      try {
        const gs = new GitService(cfg.repoRoot);
        await gs.mergeInto("main", pending.branchName);
        await discord.clearPending(planId);
        await discord.editButtonResponse(interaction, `Approved ✅ Merged \`${pending.branchName}\` into \`main\`.`);
      } catch (e) {
        await discord.editButtonResponse(
          interaction,
          `Approve failed ❌ ${(e as Error).message}\nBranch left intact: \`${pending.branchName}\``
        );
      }
    },

    onReject: async (planId, interaction) => {
      const pending = await discord.loadPending(planId);
      if (!pending) {
        await discord.editButtonResponse(interaction, `Could not find pending proposal for ${planId}`);
        return;
      }
      await discord.clearPending(planId);
      await discord.editButtonResponse(
        interaction,
        `Rejected 🛑 Proposal \`${planId}\`. Branch preserved for review: \`${pending.branchName}\`.`
      );
    }
  }
);

await discord.start();

if (cfg.watch.enabled) {
  const watcher = chokidar.watch(cfg.watch.includePrefixes.map((p) => `${cfg.repoRoot}/${p}`), {
    ignoreInitial: true
  });

  let timer: NodeJS.Timeout | null = null;
  const changed = new Set<string>();

  watcher.on("all", (_event, filePath) => {
    const rel = filePath.replace(cfg.repoRoot, "").replaceAll("\\", "/").replace(/^\/+/, "");
    if (cfg.watch.ignoreSubstrings.some((s) => rel.includes(s))) return;

    changed.add(rel);

    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      const batch = Array.from(changed);
      changed.clear();
      log.info("Watch trigger batch", batch);
      await agent.trigger({ kind: "watch", changedPaths: batch });
    }, cfg.watch.debounceMs);
  });

  log.info("File watch enabled");
} else {
  log.info("File watch disabled (set AGENT_WATCH=true to enable)");
}
