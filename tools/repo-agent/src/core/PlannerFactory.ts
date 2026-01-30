import { IPlanner } from "./IPlanner.js";
import { StubPlanner } from "./StubPlanner.js";
import { OpenAIPlanner } from "./OpenAIPlanner.js";

export function createPlanner(): IPlanner {
  if (process.env.AGENT_ENABLE_LLM === "true") {
    throw new Error(
      "AGENT_ENABLE_LLM is true, but OpenAIPlanner is not wired yet."
    );
  }

  // Default safe mode
  return new StubPlanner();
}
