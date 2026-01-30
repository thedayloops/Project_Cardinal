export function makeWorld({ size }) {
  return {
    size,
    crops: [],
    foodPickups: [],
    threats: []
  };
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
