import { spawn } from "node:child_process";

export type RunResult = {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  signal: NodeJS.Signals | null;
};

function splitIfNeeded(cmd: string, args: string[]): { cmd: string; args: string[] } {
  const trimmed = (cmd ?? "").trim();

  // Defensive: if cmd contains whitespace and args are empty,
  // treat it as a single command string like "npm run build".
  if (args.length === 0 && /\s/.test(trimmed)) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return { cmd: parts[0], args: parts.slice(1) };
    }
  }

  return { cmd: trimmed, args };
}

export function runCmdNoShell(opts: {
  cmd: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
}): Promise<RunResult> {
  const started = Date.now();

  const fixed = splitIfNeeded(opts.cmd, opts.args);
  const cmd = fixed.cmd;
  const args = fixed.args;

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (r: RunResult) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };

    if (!cmd) {
      finish({
        ok: false,
        exitCode: null,
        stdout: "",
        stderr: "runCmdNoShell: empty cmd",
        durationMs: Date.now() - started,
        signal: null,
      });
      return;
    }

    let child;
    try {
      child = spawn(cmd, args, {
        cwd: opts.cwd,
        shell: false,
        windowsHide: true,
      });
    } catch (err: any) {
      // Spawn can throw synchronously if arguments are invalid.
      finish({
        ok: false,
        exitCode: null,
        stdout: "",
        stderr: err?.message ?? String(err),
        durationMs: Date.now() - started,
        signal: null,
      });
      return;
    }

    const timer = setTimeout(() => {
      // Timeout kill: prefer SIGKILL where supported; fallback to default kill.
      try {
        child.kill("SIGKILL");
      } catch {
        try {
          child.kill();
        } catch {}
      }
    }, opts.timeoutMs);

    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));

    // 🔑 Critical: handle spawn errors (EINVAL/ENOENT/etc.)
    child.on("error", (err: any) => {
      clearTimeout(timer);
      finish({
        ok: false,
        exitCode: null,
        stdout,
        stderr: (stderr ? stderr + "\n" : "") + (err?.message ?? String(err)),
        durationMs: Date.now() - started,
        signal: null,
      });
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      finish({
        ok: code === 0,
        exitCode: code,
        stdout,
        stderr,
        durationMs: Date.now() - started,
        signal,
      });
    });
  });
}
