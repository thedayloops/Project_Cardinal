export function makeDefaultConfig(overrides = {}) {
  const cfg = {
    seed: 1,
    ticks: 200,
    dt: 1, // abstract step
    worldSize: { w: 20, h: 20 },

    npcCount: 120,
    threatCount: 4,

    // Need drain rates per tick
    needs: {
      hungerDrain: 0.006,
      fatigueDrain: 0.004
    },

    // Fear model parameters (bounded + testable)
    fear: {
      // how quickly fear rises/falls
      gain: 0.12,
      decay: 0.035,

      // how fear impacts action choice
      riskAversion: 1.25,
      temperatureBase: 0.7,
      temperatureFearScale: 0.9
    },

    // action resolution
    action: {
      moveCostFatigue: 0.010,
      moveCostHunger: 0.004,
      restRecoverFatigue: 0.020,
      eatRecoverHunger: 0.035
    },

    // perception
    perception: {
      radius: 4,
      threatRadius: 5
    },

    // policy pack selection
    policyPack: "baseline",

    // logging / report
    events: {
      keepLast: 2000
    }
  };

  return deepMerge(cfg, overrides);
}

function deepMerge(base, patch) {
  if (patch == null) return base;
  if (Array.isArray(base) || Array.isArray(patch)) return patch;
  if (typeof base !== "object" || typeof patch !== "object") return patch;

  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = k in out ? deepMerge(out[k], v) : v;
  }
  return out;
}
