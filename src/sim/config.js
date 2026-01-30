export function makeDefaultConfig(overrides = {}) {
  const cfg = {
    seed: 1337,
    ticks: 300,
    dt: 1,
    worldSize: { w: 24, h: 24 },

    npcCount: 160,
    threatCount: 6,

    needs: {
      hungerDrain: 0.006,
      fatigueDrain: 0.004
    },

    fear: {
      gain: 0.12,
      decay: 0.035,
      riskAversion: 1.25,
      temperatureBase: 0.7,
      temperatureFearScale: 0.9
    },

    action: {
      moveCostFatigue: 0.01,
      moveCostHunger: 0.004,
      restRecoverFatigue: 0.02
    },

    perception: {
      radius: 4,
      threatRadius: 5
    },

    crops: {
      baseGrowthRate: 0.003,
      baseYield: 4,
      maxPlotsPerNpc: 1
    },

    policyPack: "baseline",

    contracts: {
      enabled: true,
      patrol: { enabled: true, fraction: 0.4, groupSize: 5, routeLen: 4, waypointRadius: 2 },
      hunt: { enabled: true, fraction: 0.25, groupSize: 4, huntRadius: 6 },
      escort: { enabled: true, fraction: 0.2, groupSize: 3, followRadius: 2 }
    },

    events: { keepLast: 2000 }
  };

  return deepMerge(cfg, overrides);
}

function deepMerge(a, b) {
  if (b == null) return a;
  if (typeof a !== "object" || typeof b !== "object") return b;

  const out = { ...a };
  for (const k of Object.keys(b)) {
    out[k] = k in out ? deepMerge(out[k], b[k]) : b[k];
  }
  return out;
}
