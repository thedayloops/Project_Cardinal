export function makeIdFactory(prefix) {
  let n = 0;
  return () => `${prefix}_${++n}`;
}
