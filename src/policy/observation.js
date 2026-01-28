import { makeObservationSpec } from "../sim/types.js";
import { dist2, manhattan } from "../sim/world.js";
import { updateFear } from "../npc/emotions/fear.js";

export function buildObservation({ tick, npc, world, config }) {
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

  // Update mechanized fear *before* policy selection
  updateFear({ fear: npc.emotions.fear, threatSignal, config });

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
    }
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

function computeThreatSignal(nearbyThreats, radius) {
  if (nearbyThreats.length === 0) return 0;

  // strongest threat dominates, but distance matters
  const best = nearbyThreats[0];
  const d = Math.sqrt(best.d2);

  // closeness 1.0 at distance 0, 0.0 at distance radius
  const closeness = Math.max(0, 1 - d / Math.max(1, radius));
  const signal = best.danger * closeness;

  // lightly add second threat if present
  if (nearbyThreats.length >= 2) {
    const b2 = nearbyThreats[1];
    const d2 = Math.sqrt(b2.d2);
    const c2 = Math.max(0, 1 - d2 / Math.max(1, radius));
    return Math.min(1, signal + 0.35 * b2.danger * c2);
  }

  return Math.min(1, signal);
}
