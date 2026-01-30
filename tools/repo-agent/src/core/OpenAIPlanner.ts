import OpenAI from "openai";
import { IPlanner, FilePlan } from "./IPlanner.js";
import { AgentContext } from "./ContextBuilder.js";
import { PatchPlan } from "../schemas/PatchPlan.js";
import { loadLedger, recordTokenCall } from "../util/tokenLedger.js";

export class OpenAIPlanner implements IPlanner {
  private client: OpenAI;

  constructor(
    apiKey: string,
    private model: string,
    private artifactsDir: string
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async planFiles(ctx: AgentContext): Promise<FilePlan> {
    /* ---------- Hard safety gates ---------- */

    if (
      ctx.trigger.kind === "watch" &&
      process.env.AGENT_ALLOW_WATCH_LLM !== "true"
    ) {
      return { intent: "watch-llm-disabled", files: [] };
    }

    const ledger = await loadLedger(this.artifactsDir);
    const maxCalls = Number(process.env.AGENT_MAX_LLM_CALLS_PER_DAY ?? 50);

    if (ledger.calls >= maxCalls) {
      throw new Error("Daily LLM call limit reached");
    }

    /* ---------- LLM call ---------- */

    const response = await this.client.responses.create({
      model: this.model,
      input: JSON.stringify({
        task:
          "Select which repository files are relevant to change. JSON only.",
        rules: [
          "Return empty array if no changes needed",
          "Do not explain",
          "Do not guess"
        ],
        context: {
          trigger: ctx.trigger,
          repo: ctx.repo
        }
      }),
      text: {
        format: {
          type: "json_schema",
          name: "FilePlan",
          schema: {
            type: "object",
            required: ["intent", "files"],
            additionalProperties: false,
            properties: {
              intent: { type: "string" },
              files: {
                type: "array",
                items: { type: "string" }
              }
            }
          },
          strict: true
        } as any
      }
    });

    /* ---------- Token accounting ---------- */

    const usage = response.usage;
    if (usage) {
      await recordTokenCall(this.artifactsDir, {
        at: new Date().toISOString(),
        model: this.model,
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        totalTokens: usage.total_tokens ?? 0
      });
    }

    /* ---------- Parse + validate ---------- */

    const text = response.output_text;
    if (!text) throw new Error("Empty LLM response");

    const parsed = JSON.parse(text) as FilePlan;

    const maxFiles = Number(process.env.AGENT_MAX_FILES_FROM_LLM ?? 20);
    if (parsed.files.length > maxFiles) {
      throw new Error("LLM returned too many files");
    }

    return parsed;
  }

  async planPatch(_: AgentContext): Promise<PatchPlan> {
    throw new Error("planPatch is disabled");
  }
}
