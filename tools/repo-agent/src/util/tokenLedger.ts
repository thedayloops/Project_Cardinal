// tools/repo-agent/src/util/tokenLedger.ts
import fs from "node:fs/promises";
import path from "node:path";

export type TokenCall = {
  at: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type Ledger = {
  day: string;
  calls: number;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  history: TokenCall[];
};

const LEDGER_FILE = "token_ledger.json";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function resolveDir(dirAbs: string): string {
  // Always force an absolute, normalized directory path.
  // Callers should pass the resolved artifacts directory; we harden anyway.
  return path.resolve(dirAbs);
}

async function ensureDir(dirAbs: string) {
  try {
    await fs.mkdir(dirAbs, { recursive: true });
  } catch {
    // ignore
  }
}

function ledgerPath(dirAbs: string): string {
  const abs = resolveDir(dirAbs);
  return path.join(abs, LEDGER_FILE);
}

export async function loadLedger(dirAbs: string): Promise<Ledger> {
  const abs = resolveDir(dirAbs);
  await ensureDir(abs);

  try {
    const raw = await fs.readFile(ledgerPath(abs), "utf8");
    const parsed = JSON.parse(raw) as Ledger;

    // rollover daily, but keep file location stable
    if (parsed.day === today()) return parsed;
  } catch {
    // ignore: we'll create a new daily ledger below
  }

  return {
    day: today(),
    calls: 0,
    tokens: { input: 0, output: 0, total: 0 },
    history: [],
  };
}

export async function recordTokenCall(
  dirAbs: string,
  call: TokenCall
): Promise<Ledger> {
  const abs = resolveDir(dirAbs);
  await ensureDir(abs);

  const ledger = await loadLedger(abs);

  ledger.calls += 1;
  ledger.tokens.input += call.inputTokens;
  ledger.tokens.output += call.outputTokens;
  ledger.tokens.total += call.totalTokens;
  ledger.history.push(call);

  await fs.writeFile(ledgerPath(abs), JSON.stringify(ledger, null, 2), "utf8");

  return ledger;
}
