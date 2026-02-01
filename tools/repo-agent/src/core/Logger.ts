export class Logger {
  private timestamp() {
    return new Date().toISOString();
  }

  info(msg: string, extra?: unknown) {
    console.log(`[INFO] ${this.timestamp()} ${msg}`, extra ?? "");
  }
  warn(msg: string, extra?: unknown) {
    console.warn(`[WARN] ${this.timestamp()} ${msg}`, extra ?? "");
  }
  error(msg: string, extra?: unknown) {
    console.error(`[ERROR] ${this.timestamp()} ${msg}`, extra ?? "");
  }
}
