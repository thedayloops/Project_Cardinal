import test from "node:test";
import assert from "node:assert/strict";

import { makeDefaultConfig } from "../src/sim/config.js";
import { runSimulation } from "../src/sim/kernel.js";

// Force any hidden failures to show up.
process.on("uncaughtException", (err) => {
  console.error("\n[uncaughtException]\n", err?.stack ?? err);
  process.exitCode = 1;
});
process.on("unhandledRejection", (err) => {
  console.error("\n[unhandledRejection]\n", err?.stack ?? err);
  process.exitCode = 1;
});

test("simulation is deterministic by seed (same config values)", () => {
  console.error(`[test] node version: ${process.version}`);

  const base = makeDefaultConfig({
    seed: 42,
    ticks: 120,
    npcCount: 80,
    threatCount: 3,
    worldSize: { w: 18, h: 18 }
  });

  const cfgA = deepClone(base);
  const cfgB = deepClone(base);

  let a, b;
  try {
    a = runSimulation(cfgA);
    b = runSimulation(cfgB);
  } catch (err) {
    console.error("\n[test] runSimulation threw:\n", err?.stack ?? err);
    throw err;
  }

  try {
    assert.equal(a.report.population.alive, b.report.population.alive, "alive mismatch");
    assert.equal(a.report.metrics.totals.deaths, b.report.metrics.totals.deaths, "deaths mismatch");
    assert.deepEqual(
      a.report.metrics.totals.actions,
      b.report.metrics.totals.actions,
      "action totals mismatch"
    );

    const lastA = a.metrics.perTick.at(-1);
    const lastB = b.metrics.perTick.at(-1);
    assert.deepEqual(lastA, lastB, "last tick metrics mismatch");
  } catch (err) {
    // Dump useful diffs to stderr before failing.
    console.error("\n[determinism debug]");
    console.error("alive A/B:", a.report.population.alive, b.report.population.alive);
    console.error("deaths A/B:", a.report.metrics.totals.deaths, b.report.metrics.totals.deaths);
    console.error("actions A:", JSON.stringify(a.report.metrics.totals.actions, null, 2));
    console.error("actions B:", JSON.stringify(b.report.metrics.totals.actions, null, 2));
    console.error("last tick A:", JSON.stringify(a.metrics.perTick.at(-1), null, 2));
    console.error("last tick B:", JSON.stringify(b.metrics.perTick.at(-1), null, 2));
    throw err;
  }
});

function deepClone(x) {
  return JSON.parse(JSON.stringify(x));
}
