/* ============================================================
 * Canonical simulation interfaces
 * ============================================================ */

export const ActionKinds = Object.freeze({
  MOVE: "MOVE",
  REST: "REST",
  EAT: "EAT",
  FLEE: "FLEE",
  INVESTIGATE: "INVESTIGATE",
  HARVEST: "HARVEST",
  HUNT: "HUNT"
});

/* ============================================================
 * ActionSpec
 * ============================================================ */

export function makeActionSpec(kind, payload = {}) {
  return { kind, payload };
}

/* ============================================================
 * ObservationSpec
 * ============================================================ */

export function makeObservationSpec(payload) {
  return payload;
}

/* ============================================================
 * PolicyPack
 * ============================================================ */

export function makePolicyPack({ id, version, selectAction }) {
  if (!id) throw new Error("PolicyPack requires id");
  if (!selectAction) throw new Error("PolicyPack requires selectAction");
  return { id, version, selectAction };
}
