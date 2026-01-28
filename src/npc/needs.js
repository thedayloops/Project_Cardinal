export function makeNeeds(rng) {
  return {
    // 0..1 where 1 is critical
    hunger: rng.next() * 0.3,
    fatigue: rng.next() * 0.25
  };
}
