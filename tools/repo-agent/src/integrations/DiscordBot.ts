import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    Client,
    GatewayIntentBits,
    Interaction,
    REST,
    Routes,
    SlashCommandBuilder,
    TextChannel
} from "discord.js";
import fs from "node:fs/promises";
import path from "node:path";

export type Proposal = {
    planId: string;
    branchName: string;
    baseRef: string;
    headBefore: string;
    summary: string;
    diffSnippet: string;
    verificationSummary: string;
};

export class DiscordBot {
    private client: Client;
    private channel: TextChannel | null = null;

    constructor(
        private cfg: {
            token: string;
            clientId: string;
            guildId: string;
            channelId: string;
            artifactsDir: string;
        },
        private handlers: {
            onCommand: (i: ChatInputCommandInteraction) => Promise<void>;
            onApprove: (planId: string, interaction: Interaction) => Promise<void>;
            onReject: (planId: string, interaction: Interaction) => Promise<void>;
        }
    ) {
        this.client = new Client({ intents: [GatewayIntentBits.Guilds] });
    }

    async start(): Promise<void> {
        await this.registerCommands();

        this.client.on("ready", async () => {
            const ch = await this.client.channels.fetch(this.cfg.channelId);
            if (ch && ch.isTextBased()) this.channel = ch as TextChannel;
            console.log(`[Discord] logged in as ${this.client.user?.tag}`);
        });

        this.client.on("interactionCreate", async (interaction) => {
            if (interaction.isChatInputCommand()) {
                await this.handlers.onCommand(interaction);
            } else if (interaction.isButton()) {
                const [kind, planId] = interaction.customId.split(":");
                if (kind === "approve") await this.handlers.onApprove(planId, interaction);
                if (kind === "reject") await this.handlers.onReject(planId, interaction);
            }
        });

        await this.client.login(this.cfg.token);
    }

    async postProposal(p: Proposal): Promise<void> {
        if (!this.channel) throw new Error("Discord channel not ready");

        await this.savePending(p);

        const approve = new ButtonBuilder()
            .setCustomId(`approve:${p.planId}`)
            .setLabel("Approve & Merge")
            .setStyle(ButtonStyle.Success);

        const reject = new ButtonBuilder()
            .setCustomId(`reject:${p.planId}`)
            .setLabel("Reject")
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(approve, reject);

        const content =
            `**Repo Agent Proposal**\n` +
            `Plan: \`${p.planId}\`\n` +
            `Branch: \`${p.branchName}\`\n` +
            `Base: \`${p.baseRef}\` (HEAD before: \`${p.headBefore.slice(0, 8)}\`)\n\n` +
            `**Summary**\n${p.summary}\n\n` +
            `**Verification**\n${p.verificationSummary}\n\n` +
            `**Diff (snippet)**\n\`\`\`diff\n${truncate(p.diffSnippet, 3500)}\n\`\`\``;

        await this.channel.send({ content, components: [row] });
    }

    async reply(interaction: ChatInputCommandInteraction, content: string): Promise<void> {
        // If already replied, we must editReply; if not, reply then edit is fine.
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(content);
        } else {
            await interaction.reply(content);
        }
    }

    async editButtonResponse(interaction: Interaction, content: string): Promise<void> {
        if (interaction.isRepliable()) {
            // buttons are interactions too; always use editReply
            if (interaction.deferred || interaction.replied) await interaction.editReply(content);
            else await interaction.reply(content);
        }
    }

    async loadPending(planId: string): Promise<Proposal | null> {
        const p = await pendingPath(this.cfg.artifactsDir);
        try {
            const raw = await fs.readFile(p, "utf8");
            const list: Proposal[] = JSON.parse(raw);
            return list.find((x) => x.planId === planId) ?? null;
        } catch {
            return null;
        }
    }

    async clearPending(planId: string): Promise<void> {
        const p = await pendingPath(this.cfg.artifactsDir);
        let list: Proposal[] = [];
        try {
            list = JSON.parse(await fs.readFile(p, "utf8"));
        } catch {
            list = [];
        }
        const next = list.filter((x) => x.planId !== planId);
        await fs.mkdir(path.dirname(p), { recursive: true });
        await fs.writeFile(p, JSON.stringify(next, null, 2), "utf8");
    }

    private async savePending(proposal: Proposal): Promise<void> {
        const p = await pendingPath(this.cfg.artifactsDir);
        let list: Proposal[] = [];
        try {
            list = JSON.parse(await fs.readFile(p, "utf8"));
        } catch {
            list = [];
        }
        list = [proposal, ...list.filter((x) => x.planId !== proposal.planId)].slice(0, 30);
        await fs.mkdir(path.dirname(p), { recursive: true });
        await fs.writeFile(p, JSON.stringify(list, null, 2), "utf8");
    }

    private async registerCommands(): Promise<void> {
        const commands = [
            new SlashCommandBuilder()
                .setName("agent_status")
                .setDescription("Show agent status"),

            new SlashCommandBuilder()
                .setName("agent_run")
                .setDescription("Run the repo agent")
                .addStringOption((o) =>
                    o
                        .setName("mode")
                        .setDescription("Run mode")
                        .setRequired(false)
                        .addChoices(
                            { name: "dry-run", value: "dry-run" },
                            { name: "plan", value: "plan" },
                            { name: "plan+verify", value: "plan+verify" }
                        )
                )
        ].map((c) => c.toJSON());

        const rest = new REST({ version: "10" }).setToken(this.cfg.token);

        await rest.put(
            Routes.applicationGuildCommands(this.cfg.clientId, this.cfg.guildId),
            { body: commands }
        );
    }
}

async function pendingPath(artifactsDir: string): Promise<string> {
    return path.join(artifactsDir, "pending.json");
}

function truncate(s: string, max: number): string {
    if (s.length <= max) return s;
    return s.slice(0, max) + `\n...TRUNCATED (${s.length} chars total)`;
}
