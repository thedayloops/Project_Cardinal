import { INITIAL_CONDITIONS } from "../../initialConditions.js";

import { makeRng } from "./rng.js";
import { makeClock, stepClock } from "./time.js";
import { makeIdFactory } from "./ids.js";
import { makeWorld, clampToWorld } from "./world.js";
import { makeEventLog } from "./events.js";
import { makeMetrics, recordTick, incAction, incDeaths } from "./metrics.js";
import { makeRunReport } from "./report.js";

import { makeNpc } from "../npc/npc.js";
import { buildObservation } from "../policy/observation.js";
import { getPolicyPackById } from "../policy/policyPack.js";
import { ActionKinds } from "./types.js";

import { makeContractManager } from "../contracts/contractManager.js";
import { makeEntityRegistry, rebuildEntityRegistry } from "./entityRegistry.js";

import { makeCropPlot, tickCrop, CropStates } from "../world/crops.js";
import { makeFoodPickup } from "../world/foodPickup.js";
import { makeHuntingNode, tickHuntingNode, isHuntable } from "../world/hunting.js";

export function runSimulation(config) {
  const rng = makeRng(config.seed);
  const clock = makeClock();
  const eventLog = makeEventLog(config.events.keepLast);
  const metrics = makeMetrics();

  const worldSize = {
    w: INITIAL_CONDITIONS.world.width,
    h: INITIAL_CONDITIONS.world.height
  };

  const world = makeWorld({ size: worldSize });
  world.huntingNodes = [];

  const makeNpcId = makeIdFactory("npc");
  const makeCropId = makeIdFactory("crop");
  const makeFoodId = makeIdFactory("food");
  const makeHuntId = makeIdFactory("hunt");

  /* -------------------------------------------
   * Seed hunting nodes
   * ------------------------------------------- */
  const huntCount = Math.max(
    3,
    Math.floor((worldSize.w * worldSize.h) / 80)
  );

  for (let i = 0; i < huntCount; i++) {
    world.huntingNodes.push(
      makeHuntingNode({
        id: makeHuntId(),
        x: rng.int(0, worldSize.w - 1),
        y: rng.int(0, worldSize.h - 1),
        yieldAmount: rng.int(2, 4),
        risk: 0.06 + rng.float() * 0.08,
        respawnTicks: 60 + rng.int(0, 40)
      })
    );
  }

  /* -------------------------------------------
   * Create population (sex assigned deterministically)
   * ------------------------------------------- */
  const total = INITIAL_CONDITIONS.population.total;
  const maleCount = Math.floor(
    total * INITIAL_CONDITIONS.population.sexDistribution.male
  );

  const npcs = Array.from({ length: total }, (_, i) =>
    makeNpc({
      id: makeNpcId(),
      rng,
      worldSize,
      sex: i < maleCount ? "male" : "female"
    })
  );

  const contractManager = makeContractManager({ rng, config, world, npcs });
  const registry = makeEntityRegistry();
  const policyPack = getPolicyPackById(config.policyPack);

  /* -------------------------------------------
   * Main loop
   * ------------------------------------------- */
  for (let i = 0; i < config.ticks; i++) {
    contractManager.tick({ tick: clock.tick });
    rebuildEntityRegistry(registry, npcs, clock.tick);

    for (const c of world.crops) tickCrop(c);
    for (const h of world.huntingNodes) tickHuntingNode(h);

    let alive = 0;

    for (const npc of npcs) {
      if (!npc.alive) continue;

      npc.needs.hunger = Math.min(1, npc.needs.hunger + config.needs.hungerDrain);
      npc.needs.fatigue = Math.min(1, npc.needs.fatigue + config.needs.fatigueDrain);

      const obs = buildObservation({
        tick: clock.tick,
        npc,
        world,
        config,
        contractManager,
        registry
      });

      const action = policyPack.selectAction({ obs, rng, config });
      incAction(metrics, action.kind);

      switch (action.kind) {
        case ActionKinds.MOVE:
          npc.pos = clampToWorld(
            {
              x: npc.pos.x + (action.payload.dx ?? 0),
              y: npc.pos.y + (action.payload.dy ?? 0)
            },
            world.size
          );
          break;

        case ActionKinds.EAT: {
          const f = world.foodPickups.find(
            p => p.x === npc.pos.x && p.y === npc.pos.y
          );
          if (f) {
            f.amount -= 1;
            npc.needs.hunger = Math.max(0, npc.needs.hunger - 0.35);
            if (f.amount <= 0) {
              world.foodPickups = world.foodPickups.filter(x => x !== f);
            }
          }
          break;
        }

        case ActionKinds.INVESTIGATE: {
          const hasCrop = world.crops.some(
            c => c.x === npc.pos.x && c.y === npc.pos.y
          );
          if (!hasCrop) {
            world.crops.push(
              makeCropPlot({
                id: makeCropId(),
                x: npc.pos.x,
                y: npc.pos.y,
                growthRate: config.crops.baseGrowthRate,
                yieldAmount: config.crops.baseYield,
                ownerId: npc.id
              })
            );
          }
          break;
        }

        case ActionKinds.HARVEST: {
          const crop = world.crops.find(
            c =>
              c.x === npc.pos.x &&
              c.y === npc.pos.y &&
              c.state === CropStates.RIPE
          );
          if (crop) {
            world.foodPickups.push(
              makeFoodPickup({
                id: makeFoodId(),
                x: crop.x,
                y: crop.y,
                amount: crop.yieldAmount
              })
            );
            crop.growth = 0;
            crop.state = CropStates.GROWING;
          }
          break;
        }

        case ActionKinds.HUNT: {
          const node = world.huntingNodes.find(
            h => h.id === action.payload.targetId
          );
          if (node && isHuntable(node) && node.x === npc.pos.x && node.y === npc.pos.y) {
            if (rng.float() < node.risk) {
              npc.alive = false;
              incDeaths(metrics, 1);
              eventLog.push({
                tick: clock.tick,
                type: "NPC_DEATH",
                msg: `${npc.id} died while hunting`
              });
            } else {
              world.foodPickups.push(
                makeFoodPickup({
                  id: makeFoodId(),
                  x: node.x,
                  y: node.y,
                  amount: node.yieldAmount
                })
              );
              node.cooldown = node.respawnTicks;
            }
          }
          break;
        }
      }

      if (npc.needs.hunger >= 1) {
        npc.alive = false;
        incDeaths(metrics, 1);
        eventLog.push({
          tick: clock.tick,
          type: "NPC_DEATH",
          msg: `${npc.id} starved`
        });
      }

      if (npc.alive) alive++;
    }

    recordTick(metrics, {
      tick: clock.tick,
      alive,
      crops: world.crops.length,
      foodPickups: world.foodPickups.length,
      huntsReady: world.huntingNodes.filter(isHuntable).length
    });

    stepClock(clock, config.dt);
  }

  const report = makeRunReport({ config, metrics, eventLog, world, npcs });
  return { config, world, npcs, metrics, eventLog, report };
}
