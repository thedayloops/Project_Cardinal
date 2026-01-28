export function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

export function softmaxPick({ rng, scored, temperature }) {
  // scored: [{ item, score }]
  // temperature: higher -> more random; lower -> more greedy
  const t = Math.max(0.05, temperature);

  const maxScore = Math.max(...scored.map(s => s.score));
  const exps = scored.map(s => Math.exp((s.score - maxScore) / t));
  const sum = exps.reduce((a, b) => a + b, 0);

  let r = rng.next() * sum;
  for (let i = 0; i < scored.length; i++) {
    r -= exps[i];
    if (r <= 0) return scored[i].item;
  }
  return scored[scored.length - 1].item;
}
