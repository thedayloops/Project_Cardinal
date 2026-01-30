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

export async function loadLedger(dir: string): Promise<Ledger> {
  try {
    const raw = await fs.readFile(path.join(dir, LEDGER_FILE), "utf8");
    const parsed = JSON.parse(raw) as Ledger;

    if (parsed.day === today()) return parsed;
  } catch {}

  return {
    day: today(),
    calls: 0,
    tokens: { input: 0, output: 0, total: 0 },
    history: []
  };
}

export async function recordTokenCall(
  dir: string,
  call: TokenCall
): Promise<Ledger> {
  const ledger = await loadLedger(dir);

  ledger.calls += 1;
  ledger.tokens.input += call.inputTokens;
  ledger.tokens.output += call.outputTokens;
  ledger.tokens.total += call.totalTokens;
  ledger.history.push(call);

  await fs.writeFile(
    path.join(dir, LEDGER_FILE),
    JSON.stringify(ledger, null, 2)
  );

  return ledger;
}
