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

  error(msg: string, extra?: unknown) {
    console.error(
      `[ERROR] ${this.timestamp()} ${this.pidTag()} ${msg}`,
      extra ?? ""
    );
  }
}
