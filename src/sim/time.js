export function makeClock() {
  return { tick: 0, t: 0 };
}

export function stepClock(clock, dt) {
  clock.tick += 1;
  clock.t += dt;
}
