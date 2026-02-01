// tools/repo-agent/src/core/OpenAIPlanner.ts

import OpenAI from "openai";
import type { IPlanner, PlannerInput } from "./PlannerFactory.js";
import { recordTokenCall, type TokenCall } from "../util/tokenLedger.js";
import { defaultLogger } from "./Logger.js";
import path from "node:path";

// Runtime shape normalized into PatchPlan expectations
type PatchPlanLike = {
  meta: {
    goal: string;
    rationale: string;
    confidence: number;
  };
  scope: {
    files: string[];
    total_ops: number;
    estimated_bytes_changed: number;
  };
  expected_effects: string[];
  ops: Array<{
    id: string;
    type:
      | "create_file"
      | "update_file"
      | "replace_range"
      | "insert_after"
      | "delete_range";
    file: string;
    start_line: number;
    end_line: number | null;
    patch: string;
    reversible: boolean;
    before_summary: string;
    after_summary: string;
  }>;
  verification: {
    steps: string[];
    success_criteria: string[];
  };
};

type OpenAIPlannerOpts = {
  apiKey: string;
  planningModel: string;
  patchModel: string;
  artifactsDir: string;
};

/* ----------------------------- */
/* Helpers */
/* ----------------------------- */

function safeString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => safeString(x)).filter(Boolean);
}

function normalizePath(p: unknown): string {
  return safeString(p).replace(/\\/g, "/");
}

/* ----------------------------- */
/* Normalization */
/* ----------------------------- */

function normalizePlan(parsed: any): PatchPlanLike {
  // ----- Confidence normalization (CRITICAL FIX)
  let confidenceRaw = toNumber(parsed?.meta?.confidence);
  if (confidenceRaw === null) confidenceRaw = 0.5; // neutral default
  const confidence = clamp01(confidenceRaw);

  const plan: PatchPlanLike = {
    meta: {
      goal: safeString(parsed?.meta?.goal, "noop"),
      rationale: safeString(
        parsed?.meta?.rationale,
        "Planner returned no rationale."
      ),
      confidence,
    },
    scope: {
      files: asStringArray(parsed?.scope?.files),
      total_ops: 0,
      estimated_bytes_changed: toNumber(parsed?.scope?.estimated_bytes_changed) ?? 0,
    },
    expected_effects: asStringArray(parsed?.expected_effects),
    ops: [],
    verification: {
      steps: asStringArray(parsed?.verification?.steps),
      success_criteria: asStringArray(parsed?.verification?.success_criteria),
    },
  };

  const rawOps = Array.isArray(parsed?.ops) ? parsed.ops : [];

  for (const o of rawOps) {
    const type = safeString(o?.type) as PatchPlanLike["ops"][number]["type"];

    const file = normalizePath(o?.file);

    let startLine = toNumber(o?.start_line) ?? 1;
    if (startLine < 1) startLine = 1;

    let endLine: number | null = null;
    if (o?.end_line !== undefined && o?.end_line !== null) {
      endLine = toNumber(o.end_line) ?? startLine;
      if (endLine < startLine) endLine = startLine;
    }

    if (type === "create_file" || type === "update_file") {
      endLine = null;
    }

    plan.ops.push({
      id: safeString(o?.id, `op_${plan.ops.length + 1}`),
      type,
      file,
      start_line: startLine,
      end_line: endLine,
      patch: safeString(o?.patch),
      reversible: o?.reversible !== false,
      before_summary: safeString(o?.before_summary),
      after_summary: safeString(o?.after_summary),
    });
  }

  plan.scope.total_ops = plan.ops.length;

  if (plan.scope.files.length === 0 && plan.ops.length > 0) {
    plan.scope.files = Array.from(new Set(plan.ops.map((x) => x.file)));
  }

  return plan;
}

/* ----------------------------- */
/* Planner */
/* ----------------------------- */

export class OpenAIPlanner implements IPlanner {
  private client: OpenAI;

  constructor(private opts: OpenAIPlannerOpts) {
    if (!opts.apiKey) {
      throw new Error("OPENAI_API_KEY is required when AGENT_ENABLE_LLM=true");
    }
    this.client = new OpenAI({ apiKey: opts.apiKey });
  }

  async planPatch(input: PlannerInput) {
    const systemParts = [
      "You are a repository planning agent.",
      "Return ONLY a single valid JSON object.",
      "It MUST match the PatchPlan schema exactly.",
      "Rules:",
      "- start_line >= 1",
      "- create_file/update_file => end_line = null",
      "- replace_range/delete_range => end_line >= start_line",
      "- forward-slash paths only",
      "- minimal, low-risk changes",
      "- reversible defaults to true",
      // SELF_IMPROVE guidance — keep concise and conservative
      "SELF_IMPROVE MODE:",
      "- You may modify tools/repo-agent/**",
      "- Prioritize safety, correctness, and auditability",
      "- Avoid breaking public APIs",
    ];

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
        { role: "system", content: systemParts.join(" ") },
        { role: "user", content: JSON.stringify(payload) },
      ],
      text: { format: { type: "json_object" } },
    });

    /* ---- Token ledger (never fatal) ---- */
    try {
      const u = (res as any)?.usage;
      if (u) {
        const call: TokenCall = {
          at: new Date().toISOString(),
          model: this.opts.planningModel,
          inputTokens: Number(u.input_tokens ?? 0),
          outputTokens: Number(u.output_tokens ?? 0),
          totalTokens: Number(u.total_tokens ?? 0),
        };
        await recordTokenCall(this.opts.artifactsDir, call);
      }
    } catch (err) {
      // ledger failures must NEVER block planning
      // Log a non-fatal warning to aid observability while keeping behavior unchanged.
      try {
        defaultLogger.warn("Failed to record token call", err);
      } catch {
        // Ensure logging failures never throw
      }
    }

    const raw = (res as any)?.output_text?.trim();
    if (!raw) throw new Error("Planner returned no output");

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (err: any) {
      throw new Error(
        `Planner returned invalid JSON:\n${String(err)}\n\nPreview:\n${raw.slice(
          0,
          1200
        )}`
      );
    }

    return normalizePlan(parsed);
  }
}
