import { z } from "zod";

export const VerificationReportSchema = z.object({
  startedAtIso: z.string(),
  finishedAtIso: z.string(),
  results: z.array(
    z.object({
      name: z.string(),
      ok: z.boolean(),
      exitCode: z.number().nullable(),
      durationMs: z.number(),
      stdoutPath: z.string().optional(),
      stderrPath: z.string().optional()
    })
  ),
  overallOk: z.boolean()
});

export type VerificationReport = z.infer<typeof VerificationReportSchema>;
