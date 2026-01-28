/**
 * Stable interface: ObservationSpec
 * Policies must not rely on raw sim internals beyond this shape.
 */
export function makeObservationSpec({
  tick,
  self,
  nearbyThreats,
  nearbyFood,
  world
}) {
  return Object.freeze({
    v: 1,
    tick,
    self: freezeDeep(self),
    nearbyThreats: freezeDeep(nearbyThreats),
    nearbyFood: freezeDeep(nearbyFood),
    world: freezeDeep(world)
  });
}

/**
 * Stable interface: ActionSpec
 * Policies output one of these.
 */
export const ActionKinds = Object.freeze({
  MOVE: "MOVE",
  REST: "REST",
  EAT: "EAT",
  INVESTIGATE: "INVESTIGATE",
  FLEE: "FLEE",
  IDLE: "IDLE"
});

export function makeActionSpec(kind, payload = {}) {
  return Object.freeze({
    v: 1,
    kind,
    payload: freezeDeep(payload)
  });
}

/**
 * Stable interface: PolicyPack
 * A pack selects actions for NPCs.
 */
export function makePolicyPack({ id, version, selectAction }) {
  return Object.freeze({ id, version, selectAction });
}

function freezeDeep(x) {
  if (x == null || typeof x !== "object") return x;
  if (Array.isArray(x)) return Object.freeze(x.map(freezeDeep));
  const out = {};
  for (const [k, v] of Object.entries(x)) out[k] = freezeDeep(v);
  return Object.freeze(out);
}
