import { IPlanner } from "./IPlanner.js";
import { StubPlanner } from "./StubPlanner.js";
import { OpenAIPlanner } from "./OpenAIPlanner.js";

export function createPlanner(): IPlanner {
  if (process.env.AGENT_ENABLE_LLM === "true") {
    return new OpenAIPlanner(
      process.env.OPENAI_API_KEY!,
      process.env.OPENAI_MODEL || "gpt-5-mini",
      process.env.AGENT_ARTIFACTS_DIR || "agent_artifacts"
    );
  }
  return new StubPlanner();
}
