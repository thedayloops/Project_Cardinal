export function makeTraits(rng) {
  // bounded traits, 0..1
  return {
    boldness: rng.next(),     // higher -> less fear impact
    caution: rng.next(),      // higher -> prefers safety
    curiosity: rng.next(),    // higher -> investigate more
    sociability: rng.next()   // reserved for contracts slice
  };
}
