import { runSimulation } from "../sim/kernel.js";

export function runGovernorCycle(baseConfig) {
  const gov = baseConfig.governor;
  if (!gov?.enabled) {
    return { ok: false, text: "Governor disabled in config.governor.enabled" };
  }

  const baselineSummary = aggregateRuns({
    baseConfig,
    seeds: gov.canarySeeds,
    intervention: null,
    ticks: gov.canaryTicks
  });

  const candidates = enumerateInterventions(baseConfig);

  let best = null;
  for (const intervention of candidates) {
    const canarySummary = aggregateRuns({
      baseConfig,
      seeds: gov.canarySeeds,
      intervention,
      ticks: gov.canaryTicks
    });

    const decision = compareSummaries({
      baseline: baselineSummary,
      canary: canarySummary,
      accept: gov.accept
    });

    if (decision.accept) {
      // choose the best accepted candidate by lowest deaths, then lowest fear
      if (
        !best ||
        canarySummary.deaths < best.canary.deaths ||
        (canarySummary.deaths === best.canary.deaths && canarySummary.fearAvg < best.canary.fearAvg)
      ) {
        best = { intervention, baseline: baselineSummary, canary: canarySummary, decision };
      }
    }
  }

  if (!best) {
    return {
      ok: true,
      text: formatGovernorReport({
        status: "REJECT_ALL",
        baseline: baselineSummary,
        canary: null,
        intervention: null,
        reason: "No candidate met acceptance thresholds."
      })
    };
  }

  // “Apply” is just returning the recommended config patch (you will commit/merge manually later)
  return {
    ok: true,
    text: formatGovernorReport({
      status: "ACCEPT",
      baseline: best.baseline,
      canary: best.canary,
      intervention: best.intervention,
      reason: best.decision.reason
    })
  };
}

function aggregateRuns({ baseConfig, seeds, intervention, ticks }) {
  let deaths = 0;
  let fearAvgSum = 0;
  let aliveSum = 0;

  for (const seed of seeds) {
    const cfg = applyIntervention(clone(baseConfig), intervention);
    cfg.seed = seed;
    cfg.ticks = ticks;

    const out = runSimulation(cfg);
    deaths += out.report.metrics.totals.deaths;

    const last = out.report.metrics.last;
    fearAvgSum += (last?.fearAvg ?? 0);
    aliveSum += (last?.alive ?? 0);
  }

  const n = Math.max(1, seeds.length);
  return {
    runs: n,
    deaths,
    fearAvg: fearAvgSum / n,
    alive: aliveSum / n
  };
}

function compareSummaries({ baseline, canary, accept }) {
  const deathsDelta = canary.deaths - baseline.deaths;
  const fearDelta = canary.fearAvg - baseline.fearAvg;

  const okDeaths = deathsDelta <= (accept.maxDeathsDelta ?? 0);
  const okFear = fearDelta <= (accept.maxFearAvgDelta ?? 0.03);

  const acceptFlag = okDeaths && okFear;

  const reason = [
    `deathsΔ=${fmt(deathsDelta)} (limit ${fmt(accept.maxDeathsDelta ?? 0)})`,
    `fearΔ=${fmt(fearDelta)} (limit ${fmt(accept.maxFearAvgDelta ?? 0.03)})`
  ].join(", ");

  return { accept: acceptFlag, reason, deathsDelta, fearDelta };
}

function enumerateInterventions(baseConfig) {
  const gov = baseConfig.governor;
  const out = [];

  // Keep candidate space small/bounded (can expand later)
  const temps = range(gov.interventions.fearTemperature);
  const gains = range(gov.interventions.fearGain);
  const foods = gov.interventions.foodMultiplier.values ?? [1.0];

  for (const t of temps) {
    for (const g of gains) {
      for (const fm of foods) {
        out.push({
          fear: { temperatureBase: t },
          fearGain: g,
          foodMultiplier: fm
        });
      }
    }
  }

  return out;
}

function applyIntervention(cfg, intervention) {
  if (!intervention) return cfg;

  if (intervention.fear?.temperatureBase != null) {
    cfg.fear.temperatureBase = intervention.fear.temperatureBase;
  }
  if (intervention.fearGain != null) {
    cfg.fear.gain = intervention.fearGain;
  }
  if (intervention.foodMultiplier != null) {
    cfg.world = cfg.world ?? {};
    cfg.world.foodMultiplier = intervention.foodMultiplier;
  }

  return cfg;
}

function formatGovernorReport({ status, baseline, canary, intervention, reason }) {
  const lines = [];
  lines.push("Governor cycle");
  lines.push(`- status: ${status}`);
  lines.push(`- baseline: deaths=${baseline.deaths}, fearAvg=${fmt(baseline.fearAvg)}, alive=${fmt(baseline.alive)}`);

  if (canary) {
    lines.push(`- canary: deaths=${canary.deaths}, fearAvg=${fmt(canary.fearAvg)}, alive=${fmt(canary.alive)}`);
  }

  if (intervention) {
    lines.push("- intervention:");
    lines.push(`  - fear.temperatureBase: ${fmt(intervention.fear.temperatureBase)}`);
    lines.push(`  - fear.gain: ${fmt(intervention.fearGain)}`);
    lines.push(`  - world.foodMultiplier: ${fmt(intervention.foodMultiplier)}`);
  }

  lines.push(`- decision: ${reason}`);

  return lines.join("\n");
}

function range(spec) {
  const min = spec.min;
  const max = spec.max;
  const step = spec.step;

  const out = [];
  for (let v = min; v <= max + 1e-9; v += step) {
    out.push(round2(v));
  }
  return out;
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

function fmt(v) {
  return typeof v === "number" ? (Math.round(v * 1000) / 1000).toString() : String(v);
}

function clone(x) {
  return JSON.parse(JSON.stringify(x));
}
