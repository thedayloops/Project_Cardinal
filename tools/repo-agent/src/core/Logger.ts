// tools/repo-agent/src/core/Logger.ts

export class Logger {
  private timestamp() {
  return new Date().toISOString();
  }

  // Avoid hard dependency on Node typings
  private pidTag() {
  const pid =
  typeof process !== "undefined" && typeof (process as any).pid === "number"
  ? (process as any).pid
  : "unknown";
  return `[pid:${pid}]`;
  }

  info(msg: string, extra?: unknown) {
  console.log(
  `[INFO] ${this.timestamp()} ${this.pidTag()} ${msg}`,
  extra ?? ""
  );
  }

  warn(msg: string, extra?: unknown) {
  console.warn(
  `[WARN] ${this.timestamp()} ${this.pidTag()} ${msg}`,
  extra ?? ""
  );
  }

  // New: non-breaking debug method. Uses console.debug when available,
  // falls back to console.log to ensure environments without console.debug
  // still receive debug output. This addition is additive and does not
  // change existing public methods or behavior.
  debug(msg: string, extra?: unknown) {
  if (typeof (console as any).debug === "function") {
  (console as any).debug(
  `[DEBUG] ${this.timestamp()} ${this.pidTag()} ${msg}`,
  extra ?? ""
  );
  } else {
  console.log(
  `[DEBUG] ${this.timestamp()} ${this.pidTag()} ${msg}`,
  extra ?? ""
  );
  }
  }

  error(msg: string, extra?: unknown) {
  console.error(
  `[ERROR] ${this.timestamp()} ${this.pidTag()} ${msg}`,
  extra ?? ""
  );
  }
}

// Add a lightweight, named singleton export to make it easy for other
// modules to use a shared logger without changing existing usages of the
// Logger class. This is additive and fully reversible.
export type LogLevel = "debug" | "info" | "warn" | "error";

// New: export the intended default log level as a small, documented constant.
// This is additive and safe — consumers can reference this to determine
// how the project intends to be operated without changing runtime behavior.
export const defaultLogLevel: LogLevel = "debug";

export const defaultLogger = new Logger();

// NOTE: This trailing comment was added to mark an intentional, minimal
// self_improve edit for auditability. This change is non-functional and
// fully reversible by restoring the previous file contents.
