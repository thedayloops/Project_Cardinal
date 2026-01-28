import { makePolicyPack } from "../policyPack.js";
import { Actions } from "../actionSpec.js";
import { softmaxPick } from "../selectors/softmax.js";

export const baselinePolicyPack = makePolicyPack({
  id: "baseline",
  version: "0.2.0",
  selectAction({ obs, rng, config }) {
    const self = obs.self;

    const candidates = [
      { a: Actions.rest(), label: "rest" },
      { a: Actions.eat(), label: "eat" },
      { a: Actions.investigate(), label: "investigate" },
      { a: Actions.flee(), label: "flee" },
      ...moveCandidates(rng)
    ];

    const scored = candidates.map(c => ({
      item: c.a,
      score: scoreAction({ obs, action: c.a, config })
    }));

    // bounded rationality: softmax
    const fear = self.emotions.fear.value;

    // fear increases "temperature" => more erratic switching
    const temperature =
      config.fear.temperatureBase +
      config.fear.temperatureFearScale * fear;

    return softmaxPick({ rng, scored, temperature });
  }
});

function moveCandidates(rng) {
  const dirs = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 }
  ];

  const shuffled = dirs
    .map(d => ({ d, r: rng.next() }))
    .sort((a, b) => a.r - b.r)
    .map(x => x.d);

  return shuffled.map(d => ({ a: Actions.move(d.dx, d.dy), label: "move" }));
}

function scoreAction({ obs, action, config }) {
  const self = obs.self;

  const hunger = self.needs.hunger;
  const fatigue = self.needs.fatigue;
  const fear = self.emotions.fear.value;
  const traits = self.traits;

  const hasThreat = obs.nearbyThreats.length > 0;
  const nearestThreat = obs.nearbyThreats[0] ?? null;
  const nearestFood = obs.nearbyFood[0] ?? null;

  // drives
  const driveEat = hunger * 1.3;
  const driveRest = fatigue * 1.2;

  // fear effect (trait-moderated)
  const fearEffect =
    fear * (0.6 + 0.9 * traits.caution) * (1.15 - 0.85 * traits.boldness);

  const riskAversion = config.fear.riskAversion * (0.7 + traits.caution);

  // contract intent influence (small, bounded)
  // intent never overrides direct fear/flee or urgent hunger; it just nudges movement.
  const intent = self.contractIntent;

  const contractMoveBonus = action.kind === "MOVE"
    ? contractMoveAlignmentBonus({ obs, action, intent })
    : 0;

  switch (action.kind) {
    case "EAT": {
      if (!nearestFood) return -0.6;
      const threatPenalty = hasThreat ? riskAversion * fearEffect * 0.8 : 0;
      const benefit = driveEat * 1.6;
      return benefit - threatPenalty;
    }

    case "REST": {
      const threatPenalty = hasThreat ? 0.35 * riskAversion : 0;
      const freezeBonus = hasThreat ? fearEffect * 0.55 : 0;
      return driveRest * 1.35 + freezeBonus - threatPenalty;
    }

    case "FLEE": {
      if (!hasThreat) return -0.25;
      const closeness = threatCloseness(nearestThreat);
      return 0.9 * closeness + 1.3 * fearEffect - 0.15 * fatigue;
    }

    case "INVESTIGATE": {
      const curiosity = traits.curiosity;
      const foodHope = nearestFood ? 0.35 : 0.05;
      const threatPenalty = hasThreat ? (fearEffect * 1.25 + riskAversion * 0.4) : 0;
      return 0.35 * curiosity + foodHope - threatPenalty - 0.1 * fatigue;
    }

    case "MOVE": {
      const towardFood = nearestFood ? (hunger * 0.9) : 0.1;
      const awayThreat = hasThreat ? (fearEffect * 0.8) : 0;
      const cost = 0.1 * fatigue + 0.05 * hunger;

      const threatenedPenalty = hasThreat ? 0.15 : 0;

      // contract bonus is bounded so it won't dominate hunger/fear
      return towardFood + awayThreat + contractMoveBonus - cost - threatenedPenalty;
    }

    case "IDLE":
    default:
      return -0.2;
  }
}

function contractMoveAlignmentBonus({ obs, action, intent }) {
  if (!intent) return 0;

  // Only applies to MOVE actions: reward steps that reduce manhattan distance to a target.
  const selfPos = obs.self.pos;

  if (intent.kind === "GOTO" && intent.target) {
    const before = manhattan(selfPos, intent.target);
    const after = manhattan(
      { x: selfPos.x + (action.payload.dx ?? 0), y: selfPos.y + (action.payload.dy ?? 0) },
      intent.target
    );

    // improvement => bonus, regression => small penalty
    const delta = before - after; // +1 means moved closer by 1
    return clamp(delta * 0.22, -0.15, 0.45);
  }

  // FOLLOW_LEADER currently not resolvable to position in this slice; keep neutral
  return 0;
}

function threatCloseness(th) {
  if (!th) return 0;
  const d = Math.sqrt(th.d2);
  return 1 / (1 + d);
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
