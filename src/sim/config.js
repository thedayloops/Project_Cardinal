export function makeDefaultConfig(overrides = {}) {
  const cfg = {
    seed: 1,
    ticks: 200,
    dt: 1, // abstract step
    worldSize: { w: 20, h: 20 },

    npcCount: 120,
    threatCount: 4,

    // used by governor interventions (defaults to 1.0)
    world: {
      foodMultiplier: 1.0
    },

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

    // Slice 4: group contracts (coordination layer)
    contracts: {
      enabled: true,

      // approx population participation fractions
      patrol: {
        enabled: true,
        fraction: 0.40,
        groupSize: 5,
        routeLen: 4,
        waypointRadius: 2
      },
      hunt: {
        enabled: true,
        fraction: 0.25,
        groupSize: 4,
        huntRadius: 6
      },
      escort: {
        enabled: true,
        fraction: 0.20,
        groupSize: 3,
        followRadius: 2
      }
    },

    // Slice 4: Cardinal-like governor (bounded, testable interventions)
    governor: {
      enabled: false,

      canaryTicks: 160,
      canarySeeds: [101, 202],

      accept: {
        maxDeathsDelta: 0,
        maxFearAvgDelta: 0.03
      },

      interventions: {
        fearTemperature: { min: 0.45, max: 1.15, step: 0.10 },
        fearGain: { min: 0.08, max: 0.22, step: 0.02 },
        foodMultiplier: { values: [1.0, 1.25, 1.5] }
      }
    },

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
