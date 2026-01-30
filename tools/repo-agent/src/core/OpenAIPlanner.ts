// tools/repo-agent/src/core/OpenAIPlanner.ts
import OpenAI from "openai";
import type { IPlanner, PlannerInput } from "./PlannerFactory.js";

type OpenAIPlannerOpts = {
  apiKey: string;
  planningModel: string;
  patchModel: string; // not used yet here, but stored for later patch generation
};

export class OpenAIPlanner implements IPlanner {
  private client: OpenAI;

  constructor(private opts: OpenAIPlannerOpts) {
    this.client = new OpenAI({ apiKey: opts.apiKey });
  }

  async planPatch(input: PlannerInput) {
    const system = [
      "You are a repository planning agent.",
      "Return ONLY a single JSON object (no markdown, no commentary).",
      "It MUST match this shape:",
      "{ meta:{goal:string,rationale:string,confidence:number}, scope:{files:string[],total_ops:number,estimated_bytes_changed:number}, expected_effects:string[], ops:array, verification:{steps:string[],success_criteria:string[]} }",
      "Keep ops empty unless you are confident and the reason/mode demands changes.",
      "Prefer small, safe changes.",
    ].join(" ");

    const res = await this.client.responses.create({
      model: this.opts.planningModel,
      input: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(input) },
      ],
      text: { format: { type: "json_object" } },
    });

    const raw = res.output_text;
    const parsed = JSON.parse(raw);

    // Normalize minimal required fields (defensive)
    if (!parsed.meta) {
      parsed.meta = { goal: "noop", rationale: "Planner returned no meta.", confidence: 0 };
    }
    if (!parsed.scope) {
      parsed.scope = { files: [], total_ops: 0, estimated_bytes_changed: 0 };
    }
    if (!Array.isArray(parsed.expected_effects)) parsed.expected_effects = [];
    if (!Array.isArray(parsed.ops)) parsed.ops = [];
    if (!parsed.verification) parsed.verification = { steps: [], success_criteria: [] };
    if (!Array.isArray(parsed.verification.steps)) parsed.verification.steps = [];
    if (!Array.isArray(parsed.verification.success_criteria)) parsed.verification.success_criteria = [];

    return parsed;
  }
}
