import OpenAI from "openai";
import { IPlanner, FilePlan } from "./IPlanner.js";
import { AgentContext } from "./ContextBuilder.js";
import { PatchPlanSchema, PatchPlan } from "../schemas/PatchPlan.js";

export class OpenAIPlanner implements IPlanner {
  private client: OpenAI;

  constructor(apiKey: string, private model: string) {
    this.client = new OpenAI({ apiKey });
  }

  async planFiles(ctx: AgentContext): Promise<FilePlan> {
    // Placeholder — will be implemented later
    throw new Error("OpenAIPlanner.planFiles not enabled yet");
  }

  async planPatch(ctx: AgentContext): Promise<PatchPlan> {
    // Placeholder — will be implemented later
    throw new Error("OpenAIPlanner.planPatch not enabled yet");
  }
}
