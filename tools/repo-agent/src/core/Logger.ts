// tools/repo-agent/src/core/Logger.ts

export class Logger {
  private timestamp() {
    return new Date().toISOString();
  }

  // Avoid hard dependency on Node typings
  private pidTag() {
    const pid =
      typeof process !== "undefined" && typeof process.pid === "number"
        ? process.pid
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
