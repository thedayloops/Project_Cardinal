// Deterministic PRNG: mulberry32
export function makeRng(seed) {
  let t = seed >>> 0;
  return {
    next() {
      t += 0x6D2B79F5;
      let x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    },
    int(min, maxInclusive) {
      const r = this.next();
      return min + Math.floor(r * (maxInclusive - min + 1));
    },
    pick(arr) {
      return arr[this.int(0, arr.length - 1)];
    },
    chance(p) {
      return this.next() < p;
    }
  };
}
