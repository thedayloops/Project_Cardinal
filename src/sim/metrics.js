export function makeMetrics() {
  return {
    perTick: [],
    totals: {
      actions: new Map(), // kind -> count
      deaths: 0
    }
  };
}

export function recordTick(metrics, tickRow) {
  metrics.perTick.push(tickRow);
}

export function incAction(metrics, kind) {
  const cur = metrics.totals.actions.get(kind) ?? 0;
  metrics.totals.actions.set(kind, cur + 1);
}

export function incDeaths(metrics, n = 1) {
  metrics.totals.deaths += n;
}

export function summarizeMetrics(metrics) {
  const last = metrics.perTick.at(-1) ?? null;
  const actions = {};
  for (const [k, v] of metrics.totals.actions.entries()) actions[k] = v;

  return {
    ticks: metrics.perTick.length,
    last,
    totals: {
      actions,
      deaths: metrics.totals.deaths
    }
  };
}
