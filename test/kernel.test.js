import test from "node:test";
import assert from "node:assert/strict";

import { makeDefaultConfig } from "../src/sim/config.js";
import { runSimulation } from "../src/sim/kernel.js";

test("simulation is deterministic by seed", () => {
  const cfg = makeDefaultConfig({ seed: 42, ticks: 120, npcCount: 80, threatCount: 3 });
  const a = runSimulation(cfg);
  const b = runSimulation(cfg);

  assert.equal(a.report.population.alive, b.report.population.alive);
  assert.deepEqual(a.report.metrics.totals.actions, b.report.metrics.totals.actions);
  assert.equal(a.report.metrics.totals.deaths, b.report.metrics.totals.deaths);

  // last tick row should match
  assert.deepEqual(
    a.metrics.perTick[a.metrics.perTick.length - 1],
    b.metrics.perTick[b.metrics.perTick.length - 1]
  );
});
