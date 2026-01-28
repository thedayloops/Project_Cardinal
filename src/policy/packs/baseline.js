import { makePolicyPack } from "../policyPack.js";
import { Actions } from "../actionSpec.js";
import { softmaxPick } from "../selectors/softmax.js";

export const baselinePolicyPack = makePolicyPack({
  id: "baseline",
  version: "0.1.0",
  selectAction({ obs, rng, config }) {
    const self = obs.self;

    // Candidate actions (bounded)
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

    // “human-like”: bounded rationality via softmax.
    // temperature increases with fear -> more erratic/urgent switching
    const fear = self.emotions.fear.value;

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

  // include all moves, but shuffle deterministically-ish via rng
  const shuffled = dirs
    .map(d => ({ d, r: rng.next() }))
    .sort((a, b) => a.r - b.r)
    .map(x => x.d);

  return shuffled.map(d => ({ a: Actions.move(d.dx, d.dy), label: "move" }));
}

function scoreAction({ obs, action, config }) {
  const self = obs.self;

  const hunger = self.needs.hunger;   // 0..1 (higher is worse)
  const fatigue = self.needs.fatigue; // 0..1
  const fear = self.emotions.fear.value;

  const traits = self.traits;

  const hasThreat = obs.nearbyThreats.length > 0;
  const nearestThreat = obs.nearbyThreats[0] ?? null;
  const nearestFood = obs.nearbyFood[0] ?? null;

  // Core drives (utilities)
  const driveEat = hunger * 1.3;
  const driveRest = fatigue * 1.2;

  // Fear mechanics:
  // - increases preference for flee/rest, decreases risky investigate
  // - scaled by traits (boldness reduces, caution increases)
  const fearEffect =
    fear * (0.6 + 0.9 * traits.caution) * (1.15 - 0.85 * traits.boldness);

  const riskAversion = config.fear.riskAversion * (0.7 + traits.caution);

  // Action scoring
  switch (action.kind) {
    case "EAT": {
      if (!nearestFood) return -0.6; // no food in reach
      // eating near threats is “risky”
      const threatPenalty = hasThreat ? riskAversion * fearEffect * 0.8 : 0;
      const benefit = driveEat * 1.6;
      return benefit - threatPenalty;
    }

    case "REST": {
      // resting while threatened can be bad, unless fear is high (freeze behavior)
      const threatPenalty = hasThreat ? 0.35 * riskAversion : 0;
      const freezeBonus = hasThreat ? fearEffect * 0.55 : 0;
      return driveRest * 1.35 + freezeBonus - threatPenalty;
    }

    case "FLEE": {
      if (!hasThreat) return -0.25;
      // fleeing strongest when threat is close + fear is elevated
      const closeness = threatCloseness(nearestThreat);
      return 0.9 * closeness + 1.3 * fearEffect - 0.15 * fatigue;
    }

    case "INVESTIGATE": {
      // “curiosity” competes with fear. Investigation becomes less likely under fear.
      const curiosity = traits.curiosity;
      const foodHope = nearestFood ? 0.35 : 0.05;
      const threatPenalty = hasThreat ? (fearEffect * 1.25 + riskAversion * 0.4) : 0;
      return 0.35 * curiosity + foodHope - threatPenalty - 0.1 * fatigue;
    }

    case "MOVE": {
      // Move toward food when hungry; away from threats when afraid
      const towardFood = nearestFood ? (hunger * 0.9) : 0.1;
      const awayThreat = hasThreat ? (fearEffect * 0.8) : 0;
      const cost = 0.1 * fatigue + 0.05 * hunger;

      // if threatened, generic move is less good than explicit flee
      const threatenedPenalty = hasThreat ? 0.15 : 0;

      return towardFood + awayThreat - cost - threatenedPenalty;
    }

    case "IDLE":
    default:
      return -0.2;
  }
}

function threatCloseness(th) {
  if (!th) return 0;
  // th.d2 uses radius in observation; map smaller d2 -> higher closeness
  // avoid needing radius: use a smooth function
  const d = Math.sqrt(th.d2);
  return 1 / (1 + d); // 1 at 0, ~0.5 at 1, ~0.33 at 2, ...
}
