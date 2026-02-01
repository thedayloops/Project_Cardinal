// tools/repo-agent/src/core/OpenAIPlanner.ts

import OpenAI from "openai";
import type { IPlanner, PlannerInput } from "./PlannerFactory.js";
import { recordTokenCall, type TokenCall } from "../util/tokenLedger.js";

/* ---------------------------------- */
/* Helpers                             */
/* ---------------------------------- */

function safeString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function parseConfidence(v: unknown): number {
  // Accept numbers
  if (typeof v === "number" && Number.isFinite(v)) {
    return clamp01(v);
  }

  // Accept numeric strings ("0.8", "1", "0.75")
  if (typeof v === "string") {
    const cleaned = v.trim().replace("%", "");
    const n = Number(cleaned);
    if (Number.isFinite(n)) {
      return clamp01(n > 1 ? n / 100 : n);
    }
  }

  // Unknown / missing confidence ≠ zero confidence
  return 0.7;
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function toNumber(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => safeString(x, "")).filter(Boolean);
}

/* ---------------------------------- */
/* Normalization                       */
/* ---------------------------------- */

type PatchPlanLike = {
  meta: {
    goal: string;
    rationale: string;
    confidence: number;
    mode?: string;
  };
  scope: {
    files: string[];
    total_ops: number;
    estimated_bytes_changed: number;
  };
  expected_effects: string[];
  ops: Array<any>;
  verification: {
    steps: string[];
    success_criteria: string[];
  };
};

function normalizePlan(parsed: any): PatchPlanLike {
  const plan: PatchPlanLike = {
    meta: {
      goal: safeString(parsed?.meta?.goal, "noop"),
      rationale: safeString(
        parsed?.meta?.rationale,
        "Planner returned no rationale."
      ),
      confidence: parseConfidence(parsed?.meta?.confidence),
      mode: safeString(parsed?.meta?.mode, undefined),
    },
    scope: {
      files: asStringArray(parsed?.scope?.files),
      total_ops: toNumber(parsed?.scope?.total_ops, 0),
      estimated_bytes_changed: toNumber(
        parsed?.scope?.estimated_bytes_changed,
        0
      ),
    },
    expected_effects: asStringArray(parsed?.expected_effects),
    ops: Array.isArray(parsed?.ops) ? parsed.ops : [],
    verification: {
      steps: asStringArray(parsed?.verification?.steps),
      success_criteria: asStringArray(parsed?.verification?.success_criteria),
    },
  };

  if (!plan.scope.total_ops) {
    plan.scope.total_ops = plan.ops.length;
  }

  if (plan.scope.files.length === 0 && plan.ops.length > 0) {
    plan.scope.files = Array.from(new Set(plan.ops.map((o: any) => o.file)));
  }

  return plan;
}

/* ---------------------------------- */
/* Planner                             */
/* ---------------------------------- */

type OpenAIPlannerOpts = {
  apiKey: string;
  planningModel: string;
  patchModel: string;
  artifactsDir: string;
};

export class OpenAIPlanner implements IPlanner {
  private client: OpenAI;

  constructor(private opts: OpenAIPlannerOpts) {
    if (!opts.apiKey) {
      throw new Error(
        "OpenAIPlanner requires OPENAI_API_KEY when AGENT_ENABLE_LLM=true"
      );
    }
    this.client = new OpenAI({ apiKey: opts.apiKey });
  }

  async planPatch(input: PlannerInput) {
    const system = [
      "You are a repository planning agent.",
      "Return ONLY valid JSON.",
      "The confidence field should be a number between 0 and 1.",
    ].join(" ");

    const res = await this.client.responses.create({
      model: this.opts.planningModel,
      input: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(input) },
      ],
      text: { format: { type: "json_object" } },
    });

    // Ledger (non-fatal)
    try {
      const u = (res as any)?.usage;
      if (u) {
        const call: TokenCall = {
          at: new Date().toISOString(),
          model: this.opts.planningModel,
          inputTokens: toNumber(u.input_tokens, 0),
          outputTokens: toNumber(u.output_tokens, 0),
          totalTokens: toNumber(u.total_tokens, 0),
        };
        await recordTokenCall(this.opts.artifactsDir, call);
      }
    } catch {}

    const raw = (res as any)?.output_text;
    if (!raw) throw new Error("Planner returned no output_text");

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new Error("Planner returned invalid JSON");
    }

    return normalizePlan(parsed);
  }
}
