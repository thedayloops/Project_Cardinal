import { spawn } from "node:child_process";

export type RunResult = {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export function runCmdNoShell(opts: {
  cmd: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
}): Promise<RunResult> {
  const { cmd, args, cwd, timeoutMs } = opts;

  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(cmd, args, {
      cwd,
      shell: false,
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("close", (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - started;
      resolve({
        ok: code === 0,
        exitCode: code,
        stdout,
        stderr,
        durationMs
      });
    });
  });
}
