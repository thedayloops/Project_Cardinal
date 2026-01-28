export function makeWorld({ size, rng, threatCount }) {
  const world = {
    size,
    food: [],
    threats: []
  };

  // Seed some food piles
  const foodCount = Math.floor((size.w * size.h) / 18);
  for (let i = 0; i < foodCount; i++) {
    world.food.push({
      id: `food_${i + 1}`,
      x: rng.int(0, size.w - 1),
      y: rng.int(0, size.h - 1),
      amount: rng.int(3, 12)
    });
  }

  // Seed threats (simple roaming hazards)
  for (let i = 0; i < threatCount; i++) {
    world.threats.push({
      id: `threat_${i + 1}`,
      x: rng.int(0, size.w - 1),
      y: rng.int(0, size.h - 1),
      danger: rng.next() * 0.8 + 0.2, // 0.2..1.0
      roam: rng.next() * 0.7 + 0.3   // 0.3..1.0
    });
  }

  return world;
}

export function clampToWorld(pos, size) {
  return {
    x: Math.max(0, Math.min(size.w - 1, pos.x)),
    y: Math.max(0, Math.min(size.h - 1, pos.y))
  };
}

export function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
