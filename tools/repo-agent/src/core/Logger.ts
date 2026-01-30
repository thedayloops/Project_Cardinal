export class Logger {
  info(msg: string, extra?: unknown) {
    console.log(`[INFO] ${msg}`, extra ?? "");
  }
  warn(msg: string, extra?: unknown) {
    console.warn(`[WARN] ${msg}`, extra ?? "");
  }
  error(msg: string, extra?: unknown) {
    console.error(`[ERROR] ${msg}`, extra ?? "");
  }
}
