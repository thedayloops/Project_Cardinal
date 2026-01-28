import { makeRng } from "./rng.js";
import { makeClock, stepClock } from "./time.js";
import { makeIdFactory } from "./ids.js";
import { makeWorld, clampToWorld, dist2, manhattan } from "./world.js";
import { makeEventLog } from "./events.js";
import { makeMetrics, recordTick, incAction, incDeaths } from "./metrics.js";
import { makeRunReport } from "./report.js";

import { makeNpc } from "../npc/npc.js";
import { buildObservation } from "../policy/observation.js";
import { getPolicyPackById } from "../policy/policyPack.js";
import { ActionKinds } from "./types.js";

export function runSimulation(config) {
  const rng = makeRng(config.seed);
  const clock = makeClock();
  const eventLog = makeEventLog(config.events.keepLast);
  const metrics = makeMetrics();

  const world = makeWorld({ size: config.worldSize, rng, threatCount: config.threatCount });

  const makeNpcId = makeIdFactory("npc");
  const npcs = [];
  for (let i = 0; i < config.npcCount; i++) {
    npcs.push(
      makeNpc({
        id: makeNpcId(),
        rng,
        worldSize: config.worldSize
      })
    );
  }

  const policyPack = getPolicyPackById(config.policyPack);

  for (let i = 0; i < config.ticks; i++) {
    tickOnce({ config, rng, clock, world, npcs, policyPack, eventLog, metrics });
  }

  const report = makeRunReport({ config, metrics, eventLog, world, npcs });
  return { config, world, npcs, metrics, eventLog, report };
}

function tickOnce({ config, rng, clock, world, npcs, policyPack, eventLog, metrics }) {
  // roam threats (very simple)
  for (const th of world.threats) {
    if (rng.chance(th.roam * 0.35)) {
      const step = randomStep(rng);
      th.x = clamp(th.x + step.x, 0, world.size.w - 1);
      th.y = clamp(th.y + step.y, 0, world.size.h - 1);
    }
  }

  // NPC loop
  let aliveCount = 0;
  let fearAvg = 0;
  let hungerAvg = 0;
  let fatigueAvg = 0;

  for (const npc of npcs) {
    if (!npc.alive) continue;

    // 1) update needs baseline drain
    npc.needs.hunger = clamp01(npc.needs.hunger + config.needs.hungerDrain);
    npc.needs.fatigue = clamp01(npc.needs.fatigue + config.needs.fatigueDrain);

    // 2) build observation (stable spec)
    const obs = buildObservation({
      tick: clock.tick,
      npc,
      world,
      config
    });

    // 3) policy selects action
    const action = policyPack.selectAction({ obs, rng, config });

    // 4) apply action
    applyAction({ npc, action, world, rng, config, eventLog, tick: clock.tick, metrics });

    // 5) consequences (starvation/exhaustion thresholds)
    // (bounded “real-world constraints”: simple physiology-like failure)
    if (npc.needs.hunger >= 1 && rng.chance(0.02 + npc.needs.hunger * 0.03)) {
      npc.alive = false;
      eventLog.push({ tick: clock.tick, type: "NPC_DEATH", msg: `${npc.id} died (starvation)` });
      incDeaths(metrics, 1);
      continue;
    }
    if (npc.needs.fatigue >= 1 && rng.chance(0.02 + npc.needs.fatigue * 0.03)) {
      npc.alive = false;
      eventLog.push({ tick: clock.tick, type: "NPC_DEATH", msg: `${npc.id} died (collapse)` });
      incDeaths(metrics, 1);
      continue;
    }

    aliveCount++;
    fearAvg += npc.emotions.fear.value;
    hungerAvg += npc.needs.hunger;
    fatigueAvg += npc.needs.fatigue;
  }

  if (aliveCount > 0) {
    fearAvg /= aliveCount;
    hungerAvg /= aliveCount;
    fatigueAvg /= aliveCount;
  }

  recordTick(metrics, {
    tick: clock.tick,
    alive: aliveCount,
    fearAvg,
    hungerAvg,
    fatigueAvg,
    foodRemaining: world.food.reduce((a, f) => a + f.amount, 0),
    threatCount: world.threats.length
  });

  stepClock(clock, config.dt);
}

function applyAction({ npc, action, world, rng, config, eventLog, tick, metrics }) {
  incAction(metrics, action.kind);

  switch (action.kind) {
    case ActionKinds.MOVE: {
      const { dx = 0, dy = 0 } = action.payload;
      npc.pos = clampToWorld({ x: npc.pos.x + dx, y: npc.pos.y + dy }, world.size);
      npc.needs.fatigue = clamp01(npc.needs.fatigue + config.action.moveCostFatigue);
      npc.needs.hunger = clamp01(npc.needs.hunger + config.action.moveCostHunger);
      break;
    }

    case ActionKinds.REST: {
      npc.needs.fatigue = clamp01(npc.needs.fatigue - config.action.restRecoverFatigue);
      break;
    }

    case ActionKinds.EAT: {
      // find food at position (or adjacent)
      const food = nearestFood(world, npc.pos, 1);
      if (food) {
        const take = Math.min(food.amount, rng.int(1, 3));
        food.amount -= take;
        npc.needs.hunger = clamp01(npc.needs.hunger - config.action.eatRecoverHunger * take);
        if (food.amount <= 0) {
          world.food = world.food.filter(f => f.id !== food.id);
        }
        eventLog.push({ tick, type: "EAT", msg: `${npc.id} ate ${take} at (${food.x},${food.y})` });
      }
      break;
    }

    case ActionKinds.FLEE: {
      const th = nearestThreat(world, npc.pos, config.perception.threatRadius);
      if (th) {
        const step = stepAwayFrom(npc.pos, th, rng);
        npc.pos = clampToWorld({ x: npc.pos.x + step.x, y: npc.pos.y + step.y }, world.size);
        npc.needs.fatigue = clamp01(npc.needs.fatigue + config.action.moveCostFatigue * 1.2);
        npc.needs.hunger = clamp01(npc.needs.hunger + config.action.moveCostHunger * 1.1);
      }
      break;
    }

    case ActionKinds.INVESTIGATE: {
      // light movement toward nearest food or away from nothing; "curiosity" proxy
      const food = nearestFood(world, npc.pos, 6);
      if (food) {
        const step = stepToward(npc.pos, food, rng);
        npc.pos = clampToWorld({ x: npc.pos.x + step.x, y: npc.pos.y + step.y }, world.size);
        npc.needs.fatigue = clamp01(npc.needs.fatigue + config.action.moveCostFatigue * 0.8);
      } else if (rng.chance(0.35)) {
        const step = randomStep(rng);
        npc.pos = clampToWorld({ x: npc.pos.x + step.x, y: npc.pos.y + step.y }, world.size);
      }
      break;
    }

    case ActionKinds.IDLE:
    default:
      // nothing
      break;
  }
}

function nearestFood(world, pos, radius) {
  let best = null;
  let bestD = Infinity;
  for (const f of world.food) {
    const d = manhattan(pos, f);
    if (d <= radius && d < bestD) {
      best = f;
      bestD = d;
    }
  }
  return best;
}

function nearestThreat(world, pos, radius) {
  let best = null;
  let bestD2 = Infinity;
  const r2 = radius * radius;
  for (const t of world.threats) {
    const d2 = dist2(pos, t);
    if (d2 <= r2 && d2 < bestD2) {
      best = t;
      bestD2 = d2;
    }
  }
  return best;
}

function stepToward(pos, target, rng) {
  const dx = Math.sign(target.x - pos.x);
  const dy = Math.sign(target.y - pos.y);
  // slight randomness to avoid perfect lines
  if (rng.chance(0.15)) return randomStep(rng);
  if (Math.abs(target.x - pos.x) > Math.abs(target.y - pos.y)) return { x: dx, y: 0 };
  return { x: 0, y: dy };
}

function stepAwayFrom(pos, threat, rng) {
  const dx = -Math.sign(threat.x - pos.x);
  const dy = -Math.sign(threat.y - pos.y);
  if (rng.chance(0.2)) return randomStep(rng);
  if (Math.abs(threat.x - pos.x) > Math.abs(threat.y - pos.y)) return { x: dx, y: 0 };
  return { x: 0, y: dy };
}

function randomStep(rng) {
  const dirs = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
  ];
  return rng.pick(dirs);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function clamp01(v) {
  return clamp(v, 0, 1);
}
