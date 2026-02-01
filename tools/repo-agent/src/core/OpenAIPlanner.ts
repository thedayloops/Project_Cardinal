// tools/repo-agent/src/core/OpenAIPlanner.ts
import OpenAI from "openai";
import type { IPlanner, PlannerInput } from "./PlannerFactory.js";
import { recordTokenCall, type TokenCall } from "../util/tokenLedger.js";

// Runtime shape we normalize into (matches src/schemas/PatchPlan.ts expectations)
type PatchPlanLike = {
  meta: { goal: string; rationale: string; confidence: number };
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
  verification: { steps: string[]; success_criteria: string[] };
};

type OpenAIPlannerOpts = {
  apiKey: string;
  planningModel: string;
  patchModel: string; // reserved for later execution phase
  artifactsDir: string; // absolute dir where token_ledger.json should live
};

function safeString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function toNumber(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => safeString(x, "")).filter(Boolean);
}

function normalizePlan(parsed: any): PatchPlanLike {
  const plan: PatchPlanLike = {
    meta: {
      goal: safeString(parsed?.meta?.goal, "noop"),
      rationale: safeString(
        parsed?.meta?.rationale,
        "Planner returned no rationale."
      ),
      confidence: toNumber(parsed?.meta?.confidence, 0),
    },
    scope: {
      files: asStringArray(parsed?.scope?.files),
      total_ops: toNumber(parsed?.scope?.total_ops, 0),
      estimated_bytes_changed: toNumber(parsed?.scope?.estimated_bytes_changed, 0),
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

    // Normalize file paths (discord/agent often runs on Windows)
    const file = safeString(o?.file).replace(/\\/g, "/");

    // Guardrails requires start_line >= 1 even for file ops.
    let startLine = toNumber(o?.start_line, 1);
    if (startLine < 1) startLine = 1;

    // For file ops, end_line should be null; for range ops it must be a number.
    let endLine: number | null = null;
    if (o?.end_line !== undefined && o?.end_line !== null) {
      // Convert to a number with a safe fallback of startLine.
      endLine = toNumber(o.end_line, startLine);
      // Ensure endLine is at least startLine to avoid trivial LLM numeric issues.
      if (endLine < startLine) endLine = startLine;
    }

    // If planner accidentally emits 0/undefined for file ops, force the safe shape.
    if (type === "create_file" || type === "update_file") {
      endLine = null;
    }

    plan.ops.push({
      id: safeString(o?.id, `op_${plan.ops.length + 1}`),
      type,
      file,
      start_line: startLine,
      end_line: endLine,
      patch: safeString(o?.patch, ""),
      reversible: o?.reversible === true, // if missing/false, Guardrails will reject (intentional)
      before_summary: safeString(o?.before_summary, ""),
      after_summary: safeString(o?.after_summary, ""),
    });
  }

  // Keep scope totals consistent
  if (!plan.scope.total_ops || plan.scope.total_ops <= 0) {
    plan.scope.total_ops = plan.ops.length;
  }
  if (plan.scope.files.length === 0 && plan.ops.length > 0) {
    plan.scope.files = Array.from(new Set(plan.ops.map((x) => x.file)));
  }

  return plan;
}

export class OpenAIPlanner implements IPlanner {
  private client: OpenAI;

  constructor(private opts: OpenAIPlannerOpts) {
    if (!opts.apiKey || opts.apiKey.trim() === "") {
      throw new Error(
        "OpenAIPlanner requires OPENAI_API_KEY (set it when AGENT_ENABLE_LLM=true)."
      );
    }
    this.client = new OpenAI({ apiKey: opts.apiKey });
  }

  async planPatch(input: PlannerInput) {
    const systemParts = [
      "You are a repository planning agent.",
      "Return ONLY a single valid JSON object (no markdown, no commentary).",
      "It MUST match the PatchPlan schema exactly.",
      "Critical constraints:",
      "- All ops MUST have start_line >= 1.",
      "- update_file/create_file MUST have end_line=null.",
      "- replace_range/delete_range MUST have end_line as a number >= start_line.",
      "- Use forward-slash paths (src/core/Agent.ts), do not invent files.",
      "- Keep changes minimal and low-risk; keep ops small and focused.",
      "- Do NOT add new Discord commands and do NOT remove or rename existing commands/options.",
      "- If you propose changes to the repo-agent itself, keep them additive and backwards-compatible.",
      "- If an op is missing the 'reversible' field, set it to true.",
    ];

    if (input.mode === "self_improve") {
      systemParts.push(
        "SELF-IMPROVE MODE:",
        "- You are explicitly allowed to modify files under tools/repo-agent/**.",
        "- Focus on reliability, safety, UX (Discord limits), token efficiency, and auditability.",
        "- Prefer small refactors and helper utilities over sweeping rewrites."
      );
    } else {
      systemParts.push(
        "In non-self_improve modes, prefer changes that advance the user-requested goal and avoid unrelated refactors."
      );
    }

    const system = systemParts.join(" ");

    // Keep payload lean
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

    // Token ledger
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
    } catch {
      // never fail the planner on ledger issues
    }

    const raw = (res as any)?.output_text?.trim();
    if (!raw) throw new Error("Planner returned no output_text");

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (err: any) {
      const preview =
        raw.length > 1200 ? raw.slice(0, 1200) + "\n…TRUNCATED…" : raw;
      throw new Error(
        `Planner returned invalid JSON.\n\n${String(err)}\n\nRaw preview:\n${preview}`
      );
    }

    return normalizePlan(parsed);
  }
}
