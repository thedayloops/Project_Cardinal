import { z } from "zod";

export const FileOpSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create"),
    path: z.string(),
    content: z.string()
  }),
  z.object({
    type: z.literal("update"),
    path: z.string(),
    content: z.string()
  }),
  z.object({
    type: z.literal("delete"),
    path: z.string()
  }),
  z.object({
    type: z.literal("rename"),
    from: z.string(),
    to: z.string()
  })
]);

export const PatchPlanSchema = z.object({
  meta: z.object({
    planId: z.string().min(6),
    createdAtIso: z.string(),
    baseRef: z.string().default("HEAD"),
    branchName: z.string().min(3),
    commitMessage: z.string().min(5),
    rollback: z.object({
      strategy: z.enum(["git_branch", "git_reset"]),
      baseHead: z.string().min(4),
      instructions: z.string().min(10)
    }),
    // Optional unlocks for locked paths (must be explicit)
    unlockPathPrefixes: z.array(z.string()).default([])
  }),
  intent: z.string().min(5),
  ops: z.array(FileOpSchema).min(1),
  verify: z
    .object({
      commands: z.array(z.string()).default([]) // names from allowlist
    })
    .default({ commands: [] }),
  notes: z.object({
    summary: z.string().min(10),
    risks: z.array(z.string()).default([]),
    followups: z.array(z.string()).default([])
  })
});

export type PatchPlan = z.infer<typeof PatchPlanSchema>;
export type FileOp = z.infer<typeof FileOpSchema>;
