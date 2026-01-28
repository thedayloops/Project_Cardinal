import { makeObservationSpec } from "../sim/types.js";
import { dist2, manhattan } from "../sim/world.js";
import { updateFear } from "../npc/emotions/fear.js";
import { makeContractRef, ContractKinds } from "../contracts/contractTypes.js";

export function buildObservation({ tick, npc, world, config, contractManager }) {
  const radius = config.perception.radius;
  const r2 = radius * radius;

  const nearbyThreats = [];
  for (const t of world.threats) {
    const d2 = dist2(npc.pos, t);
    if (d2 <= r2) {
      nearbyThreats.push({
        id: t.id,
        x: t.x,
        y: t.y,
        danger: t.danger,
        d2
      });
    }
  }
  nearbyThreats.sort((a, b) => a.d2 - b.d2);

  const nearbyFood = [];
  for (const f of world.food) {
    const d = manhattan(npc.pos, f);
    if (d <= radius) {
      nearbyFood.push({
        id: f.id,
        x: f.x,
        y: f.y,
        amount: f.amount,
        d
      });
    }
  }
  nearbyFood.sort((a, b) => a.d - b.d);

  // Threat signal normalized to ~0..1
  const threatSignal = computeThreatSignal(nearbyThreats, radius);

  // Update mechanized fear before policy selection
  updateFear({ fear: npc.emotions.fear, threatSignal, config });

  // Contract info + contract intent
  const contract = contractManager?.getContractForNpc(npc) ?? null;
  const contractRef = contract ? makeContractRef(contract) : null;
  const contractIntent = contract ? computeContractIntent({ npc, contract, world }) : null;

  const self = {
    id: npc.id,
    pos: npc.pos,
    alive: npc.alive,
    needs: npc.needs,
    traits: npc.traits,
    emotions: {
      fear: {
        value: npc.emotions.fear.value,
        lastStimulus: npc.emotions.fear.lastStimulus
      }
    },
    contract: contractRef,
    contractIntent
  };

  const worldView = {
    size: world.size
  };

  return makeObservationSpec({
    tick,
    self,
    nearbyThreats,
    nearbyFood,
    world: worldView
  });
}

function computeContractIntent({ npc, contract, world }) {
  // “intent” is a small, explainable target the policy can optionally follow
  if (contract.kind === ContractKinds.PATROL) {
    const wp = contract.patrol.route[contract.patrol.index];
    return {
      kind: "GOTO",
      target: { x: wp.x, y: wp.y },
      note: "patrol_waypoint"
    };
  }

  if (contract.kind === ContractKinds.ESCORT) {
    const leader = findEntityById(world, contract.leaderId);
    // leader is not in world lists; just report leaderId + “FOLLOW” and let policy follow leader via shared ref
    // We'll include leaderId and let baseline policy treat it as a “follow leader position” if it can resolve it.
    return {
      kind: "FOLLOW_LEADER",
      leaderId: contract.leaderId,
      followRadius: contract.escort.followRadius
    };
  }

  if (contract.kind === ContractKinds.HUNT) {
    // Hunt intent: move toward nearest threat (by global scan), but bounded by huntRadius around leader
    // We'll compute around leader’s current position (policy will still override if starving/terrified).
    const leaderNpcPos = npc.pos; // fallback if leader not resolved by higher layer
    const th = nearestThreatToPoint(world, leaderNpcPos, contract.hunt.huntRadius);
    if (!th) return { kind: "SEARCH", note: "hunt_no_target" };
    return {
      kind: "GOTO",
      target: { x: th.x, y: th.y },
      note: "hunt_target"
    };
  }

  return null;
}

function nearestThreatToPoint(world, point, radius) {
  let best = null;
  let bestD2 = Infinity;
  const r2 = radius * radius;
  for (const t of world.threats) {
    const d2 = dist2(point, t);
    if (d2 <= r2 && d2 < bestD2) {
      best = t;
      bestD2 = d2;
    }
  }
  return best;
}

function computeThreatSignal(nearbyThreats, radius) {
  if (nearbyThreats.length === 0) return 0;

  const best = nearbyThreats[0];
  const d = Math.sqrt(best.d2);

  const closeness = Math.max(0, 1 - d / Math.max(1, radius));
  const signal = best.danger * closeness;

  if (nearbyThreats.length >= 2) {
    const b2 = nearbyThreats[1];
    const d2 = Math.sqrt(b2.d2);
    const c2 = Math.max(0, 1 - d2 / Math.max(1, radius));
    return Math.min(1, signal + 0.35 * b2.danger * c2);
  }

  return Math.min(1, signal);
}

// Placeholder: contracts refer to NPCs; world doesn't contain NPCs.
// We keep this helper for future when you add world entities registry.
function findEntityById(_world, _id) {
  return null;
}
