// tools/repo-agent/src/core/OpenAIPlanner.ts
import OpenAI from "openai";
import type { IPlanner, PlannerInput } from "./PlannerFactory.js";
import { recordTokenCall, type TokenCall } from "../util/tokenLedger.js";

type OpenAIPlannerOpts = {
  apiKey: string;
  planningModel: string;
  patchModel: string; // reserved for later execution phase
  artifactsDir: string; // absolute artifacts dir for token ledger
};

export class OpenAIPlanner implements IPlanner {
  private client: OpenAI;

  constructor(private opts: OpenAIPlannerOpts) {
    this.client = new OpenAI({ apiKey: opts.apiKey });
  }

  async planPatch(input: PlannerInput) {
    // Keep this short to save tokens
    const system =
      "Return ONLY valid JSON matching PatchPlan: " +
      "{meta:{goal,rationale,confidence},scope:{files,total_ops,estimated_bytes_changed},expected_effects,ops,verification:{steps,success_criteria}}. " +
      "Prefer minimal, low-risk improvements. Never invent files. No markdown.";

    const payload = {
      mode: input.mode,
      reason: input.reason ?? null,
      repo: input.repo,
      scope: input.scope,
      filesPreview: input.filesPreview,
    };

    const res = await this.client.responses.create({
      model: this.opts.planningModel,
      input: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(payload) },
      ],
      text: { format: { type: "json_object" } },
    });

    // Token ledger (defensive)
    try {
      const u = (res as any).usage;
      if (u) {
        const call: TokenCall = {
          at: new Date().toISOString(),
          model: this.opts.planningModel,
          inputTokens: u.input_tokens ?? 0,
          outputTokens: u.output_tokens ?? 0,
          totalTokens: u.total_tokens ?? 0,
        };
        await recordTokenCall(this.opts.artifactsDir, call);
      }
    } catch (e) {
      console.warn("[token-ledger] failed to record usage:", e);
    }

    const raw = res.output_text?.trim();
    if (!raw) throw new Error("Planner returned no output text");

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (err: any) {
      const preview = raw.length > 800 ? raw.slice(0, 800) + "\n…TRUNCATED…" : raw;
      throw new Error(
        "Planner returned invalid JSON.\n\n" +
          String(err) +
          "\n\nRaw preview:\n" +
          preview
      );
    }

    // Defensive normalization
    if (!parsed.meta) {
      parsed.meta = { goal: "noop", rationale: "Missing meta", confidence: 0 };
    }
    if (!parsed.scope) {
      parsed.scope = { files: [], total_ops: 0, estimated_bytes_changed: 0 };
    }
    if (!Array.isArray(parsed.expected_effects)) parsed.expected_effects = [];
    if (!Array.isArray(parsed.ops)) parsed.ops = [];
    if (!parsed.verification) parsed.verification = { steps: [], success_criteria: [] };
    if (!Array.isArray(parsed.verification.steps)) parsed.verification.steps = [];
    if (!Array.isArray(parsed.verification.success_criteria))
      parsed.verification.success_criteria = [];

    if (parsed.ops.length > 0 && parsed.scope.total_ops === 0) {
      parsed.scope.total_ops = parsed.ops.length;
    }

    return parsed;
  }
}
