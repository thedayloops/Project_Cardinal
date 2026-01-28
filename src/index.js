import { makeDefaultConfig } from "./sim/config.js";
import { runSimulation } from "./sim/kernel.js";
import { formatRunReport } from "./sim/report.js";

const config = makeDefaultConfig({
  seed: 1337,
  ticks: 300,
  npcCount: 160,
  threatCount: 6,
  worldSize: { w: 24, h: 24 }
});

const result = runSimulation(config);
console.log(formatRunReport(result.report));
