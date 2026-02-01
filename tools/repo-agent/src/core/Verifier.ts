import path from "node:path";
import { ensureDir, writeFileAtomic } from "../util/fsSafe.js";
import { runCmdNoShell } from "../util/childProc.js";
import { VerificationReport } from "../schemas/VerificationReport.js";

export class Verifier {
  constructor(
    private repoRoot: string,
    private artifactsDir: string,
    private allowlist: Record<string, { cmd: string; args: string[]; cwd?: string }>
  ) {}

  async run(commandNames: string[]): Promise<VerificationReport> {
    const startedAtIso = new Date().toISOString();
    await ensureDir(this.artifactsDir);

    const results: VerificationReport["results"] = [];

    for (const name of commandNames) {
      const spec = this.allowlist[name];
      const at = Date.now();

      const outPath = path.join(
        this.artifactsDir,
        `verify_${safe(name)}_${at}_stdout.log`
      );
      const errPath = path.join(
        this.artifactsDir,
        `verify_${safe(name)}_${at}_stderr.log`
      );

      if (!spec) {
        await writeFileAtomic(outPath, "");
        await writeFileAtomic(errPath, `Verification command not allowlisted: ${name}`);
        results.push({
          name,
          ok: false,
          exitCode: null,
          durationMs: 0,
          stdoutPath: outPath,
          stderrPath: errPath,
        });
        continue;
      }

      const cwd = path.resolve(this.repoRoot, spec.cwd || "");

      const r = await runCmdNoShell({
        cmd: spec.cmd,
        args: spec.args,
        cwd,
        timeoutMs: 20 * 60 * 1000,
      });

      await writeFileAtomic(outPath, r.stdout ?? "");
      await writeFileAtomic(errPath, r.stderr ?? "");

      results.push({
        name,
        ok: r.ok,
        exitCode: r.exitCode,
        durationMs: r.durationMs,
        stdoutPath: outPath,
        stderrPath: errPath,
      });
    }

    const overallOk = results.every((x) => x.ok);
    const finishedAtIso = new Date().toISOString();

    return { startedAtIso, finishedAtIso, results, overallOk };
  }
}

function safe(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
}
