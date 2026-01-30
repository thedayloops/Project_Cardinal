/**
 * Deterministic RNG (LCG)
 * Backward + forward compatible.
 *
 * Exposes:
 * - next()   -> raw uint32
 * - float()  -> [0, 1)
 * - int(a,b) -> integer range
 * - chance(p)
 */

export function makeRng(seed) {
  let state = seed >>> 0;

  function nextUInt32() {
    // Numerical Recipes LCG
    state = (1664525 * state + 1013904223) >>> 0;
    return state;
  }

  return {
    /**
     * Legacy API — raw uint32
     */
    next() {
      return nextUInt32();
    },

    /**
     * Canonical float API
     */
    float() {
      return nextUInt32() / 0x100000000;
    },

    /**
     * Integer in [min, max]
     */
    int(min, max) {
      if (max < min) [min, max] = [max, min];
      const range = max - min + 1;
      return min + (nextUInt32() % range);
    },

    /**
     * Boolean with probability p
     */
    chance(p) {
      return this.float() < p;
    }
  };
}
