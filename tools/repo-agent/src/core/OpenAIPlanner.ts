// tools/repo-agent/src/core/OpenAIPlanner.ts
import OpenAI from "openai";
import type { IPlanner, PlannerInput } from "./PlannerFactory.js";

type OpenAIPlannerOpts = {
  apiKey: string;
  planningModel: string;
  patchModel: string; // reserved for later execution phase
};

export class OpenAIPlanner implements IPlanner {
  private client: OpenAI;

  constructor(private opts: OpenAIPlannerOpts) {
    this.client = new OpenAI({ apiKey: opts.apiKey });
  }

  async planPatch(input: PlannerInput) {
    const system = [
      "You are a repository planning agent.",
      "You MUST return a single valid JSON object and nothing else.",
      "The JSON MUST match this exact shape:",
      "{",
      "  meta:{goal:string,rationale:string,confidence:number},",
      "  scope:{files:string[],total_ops:number,estimated_bytes_changed:number},",
      "  expected_effects:string[],",
      "  ops:array,",
      "  verification:{steps:string[],success_criteria:string[]}",
      "}",
      "",
      "Rules:",
      "- If mode is 'plan', 'verify', or 'deep', you SHOULD propose at least one small improvement if any reasonable improvement exists.",
      "- Improvements may include: docs, comments, safety checks, typing, validation, logging, or TODO notes.",
      "- If no code changes are needed, ops MAY be empty, but meta.goal must explain why.",
      "- Prefer minimal, low-risk changes.",
      "- Never invent files that do not exist.",
      "- Do NOT include markdown or commentary outside JSON.",
    ].join(" ");

    const res = await this.client.responses.create({
      model: this.opts.planningModel,
      input: [
        { role: "system", content: system },
        {
          role: "user",
          content: JSON.stringify(
            {
              mode: input.mode,
              reason: input.reason ?? null,
              repo: input.repo,
              filesPreview: input.filesPreview.map((f) => ({
                path: f.path,
                // truncate per-file to keep token usage sane
                content:
                  f.content.length > 4000
                    ? f.content.slice(0, 4000) + "\n…TRUNCATED…"
                    : f.content,
              })),
            },
            null,
            2
          ),
        },
      ],
      text: { format: { type: "json_object" } },
    });

    // Responses API guarantees text, but be defensive
    const raw = res.output_text?.trim();
    if (!raw) {
      throw new Error("Planner returned no output text");
    }

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error("Planner returned invalid JSON");
    }

    // -------------------------
    // Defensive normalization
    // -------------------------

    if (!parsed.meta) {
      parsed.meta = {
        goal: "No changes proposed",
        rationale: "Planner did not return meta information.",
        confidence: 0,
      };
    }

    if (!parsed.scope) {
      parsed.scope = {
        files: [],
        total_ops: 0,
        estimated_bytes_changed: 0,
      };
    }

    if (!Array.isArray(parsed.expected_effects)) {
      parsed.expected_effects = [];
    }

    if (!Array.isArray(parsed.ops)) {
      parsed.ops = [];
    }

    if (!parsed.verification) {
      parsed.verification = { steps: [], success_criteria: [] };
    }

    if (!Array.isArray(parsed.verification.steps)) {
      parsed.verification.steps = [];
    }

    if (!Array.isArray(parsed.verification.success_criteria)) {
      parsed.verification.success_criteria = [];
    }

    // Final sanity: scope must align with ops
    if (parsed.ops.length > 0 && parsed.scope.total_ops === 0) {
      parsed.scope.total_ops = parsed.ops.length;
    }

    return parsed;
  }
}
