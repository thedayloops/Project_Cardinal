import OpenAI from "openai";
import { PatchPlanSchema, type PatchPlan } from "../schemas/PatchPlan.js";
import { AgentContext } from "./ContextBuilder.js";

export class Planner {
  private client: OpenAI;

  constructor(apiKey: string, private model: string) {
    this.client = new OpenAI({ apiKey });
  }

  async createPatchPlan(ctx: AgentContext): Promise<PatchPlan> {
    const schemaJson = patchPlanJsonSchema();

    const prompt = {
      role: "user" as const,
      content: JSON.stringify(
        {
          task:
            "You are a local repo agent planner. Produce a PatchPlan JSON ONLY. No prose. No markdown. No code fences.",
          rules: [
            "Use flat ops with nullable fields.",
            "Set unused fields to null.",
            "Do not invent fields.",
            "Obey guardrails."
          ],
          constraints: {
            repoOnly: true,
            noSecrets: true,
            noEnvFiles: true,
            avoidLockedPathsUnlessUnlocked: true,
            maxOps: 25,
            maxTotalWriteBytes: 300000
          },
          context: ctx
        },
        null,
        2
      )
    };

    const resp = await this.client.responses.create({
      model: this.model,
      input: [prompt],
      text: {
        format: {
          type: "json_schema",
          name: "PatchPlan",
          schema: schemaJson,
          strict: true
        } as any // SDK typing lag
      }
    });

    const text = resp.output_text;
    if (!text) {
      throw new Error("Planner returned no output_text");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(
        `Planner returned invalid JSON:\n${text.slice(0, 2000)}`
      );
    }

    // Zod enforces semantic correctness
    return PatchPlanSchema.parse(parsed);
  }
}

/**
 * OpenAI-compatible JSON Schema.
 * All properties required, nullable where not used.
 */
function patchPlanJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["meta", "intent", "ops", "verify", "notes"],
    properties: {
      meta: {
        type: "object",
        additionalProperties: false,
        required: [
          "planId",
          "createdAtIso",
          "baseRef",
          "branchName",
          "commitMessage",
          "rollback",
          "unlockPathPrefixes"
        ],
        properties: {
          planId: { type: "string" },
          createdAtIso: { type: "string" },
          baseRef: { type: "string" },
          branchName: { type: "string" },
          commitMessage: { type: "string" },
          unlockPathPrefixes: {
            type: "array",
            items: { type: "string" }
          },
          rollback: {
            type: "object",
            additionalProperties: false,
            required: ["strategy", "baseHead", "instructions"],
            properties: {
              strategy: {
                type: "string",
                enum: ["git_branch", "git_reset"]
              },
              baseHead: { type: "string" },
              instructions: { type: "string" }
            }
          }
        }
      },

      intent: { type: "string" },

      ops: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["type", "path", "from", "to", "content"],
          properties: {
            type: {
              type: "string",
              enum: ["create", "update", "delete", "rename"]
            },
            path: { type: ["string", "null"] },
            from: { type: ["string", "null"] },
            to: { type: ["string", "null"] },
            content: { type: ["string", "null"] }
          }
        }
      },

      verify: {
        type: "object",
        additionalProperties: false,
        required: ["commands"],
        properties: {
          commands: {
            type: "array",
            items: { type: "string" }
          }
        }
      },

      notes: {
        type: "object",
        additionalProperties: false,
        required: ["summary", "risks", "followups"],
        properties: {
          summary: { type: "string" },
          risks: {
            type: "array",
            items: { type: "string" }
          },
          followups: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    }
  };
}
