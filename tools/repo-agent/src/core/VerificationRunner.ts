import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type VerificationResult = {
  success: boolean;
  stdout: string;
  stderr: string;
};

export type VerificationCommand = {
  cmd: string;
  args: string[];
  cwd?: string;
  timeoutMs?: number;
};

export class VerificationRunner {
  constructor(
    private allowlist: Record<string, VerificationCommand>
  ) {}

  async run(key: string): Promise<VerificationResult> {
    const entry = this.allowlist[key];
    if (!entry) {
      throw new Error(`Verification command not allowlisted: ${key}`);
    }

    try {
      const { stdout, stderr } = await execFileAsync(
        entry.cmd,
        entry.args,
        {
          cwd: entry.cwd,
          timeout: entry.timeoutMs ?? 60_000,
          maxBuffer: 10 * 1024 * 1024
        }
      );

      return {
        success: true,
        stdout: stdout ?? "",
        stderr: stderr ?? ""
      };
    } catch (err: any) {
      return {
        success: false,
        stdout: err.stdout ?? "",
        stderr: err.stderr ?? err.message ?? ""
      };
    }
  }
}
