import { makeDefaultConfig } from "./sim/config.js";
import { runGovernorCycle } from "./governor/governor.js";

const baseConfig = makeDefaultConfig({
  seed: 1337,
  ticks: 200,
  npcCount: 160,
  threatCount: 6,
  worldSize: { w: 24, h: 24 },
  governor: {
    enabled: true
  }
});

const result = runGovernorCycle(baseConfig);
console.log(result.text);
