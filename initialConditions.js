/**
 * Initial Conditions
 * ------------------
 * Single source of truth for world + population setup.
 * Imported by simulation bootstrap and config builders.
 */

export const INITIAL_CONDITIONS = Object.freeze({
  world: {
    width: 24,
    height: 24
  },

  population: {
    total: 160,

    sexDistribution: {
      male: 0.5,
      female: 0.5
    }
  }
});
