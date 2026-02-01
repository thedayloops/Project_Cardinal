// tools/repo-agent/src/core/OpenAIPlanner.ts

import OpenAI from "openai";
import type { IPlanner, PlannerInput } from "./PlannerFactory.js";
import { recordTokenCall, type TokenCall } from "../util/tokenLedger.js";

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
  patchModel: string;
  artifactsDir: string;
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
  return v.map((x) => safeString(x)).filter(Boolean);
}

function normalizePlan(parsed: any): PatchPlanLike {
  const plan: PatchPlanLike = {
    meta: {
      goal: safeString(parsed?.meta?.goal, "noop"),
      rationale: safeString(parsed?.meta?.rationale, ""),
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
    let file = safeString(o?.file).replace(/\\/g, "/");

    // 🔧 Normalize repo-agent paths
    if (file.startsWith("tools/repo-agent/")) {
      file = file.replace(/^tools\/repo-agent\//, "");
    }

    let startLine = Math.max(1, toNumber(o?.start_line, 1));
    let endLine: number | null =
      o?.end_line == null ? null : Math.max(startLine, toNumber(o.end_line, startLine));

    if (o?.type === "create_file" || o?.type === "update_file") {
      endLine = null;
    }

    plan.ops.push({
      id: safeString(o?.id, `op_${plan.ops.length + 1}`),
      type: o?.type,
      file,
      start_line: startLine,
      end_line: endLine,
      patch: safeString(o?.patch, ""),
      reversible: o?.reversible !== false,
      before_summary: safeString(o?.before_summary, ""),
      after_summary: safeString(o?.after_summary, ""),
    });
  }

  if (!plan.scope.total_ops) plan.scope.total_ops = plan.ops.length;
  if (!plan.scope.files.length)
    plan.scope.files = [...new Set(plan.ops.map((o) => o.file))];

  return plan;
}

export class OpenAIPlanner implements IPlanner {
  private client: OpenAI;

  constructor(private opts: OpenAIPlannerOpts) {
    if (!opts.apiKey) {
      throw new Error("OPENAI_API_KEY is required when AGENT_ENABLE_LLM=true");
    }
    this.client = new OpenAI({ apiKey: opts.apiKey });
  }

  async planPatch(input: PlannerInput) {
    const res = await this.client.responses.create({
      model: this.opts.planningModel,
      input: [
        { role: "system", content: "Return only valid JSON PatchPlan." },
        { role: "user", content: JSON.stringify(input) },
      ],
      text: { format: { type: "json_object" } },
    });

    try {
      const u = (res as any)?.usage;
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
    } catch {}

    const raw = (res as any)?.output_text;
    if (!raw) throw new Error("Planner returned no output");

    return normalizePlan(JSON.parse(raw));
  }
}
