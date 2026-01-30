import { makeObservationSpec } from "../sim/types.js";
import { dist2, manhattan } from "../sim/world.js";
import { updateFear } from "../npc/emotions/fear.js";
import { makeContractRef } from "../contracts/contractTypes.js";
import { CropStates } from "../world/crops.js";
import { isHuntable } from "../world/hunting.js";

export function buildObservation({ tick, npc, world, config, contractManager }) {
  const radius = config.perception.radius;
  const r2 = radius * radius;

  const nearbyThreats = [];
  for (const t of world.threats) {
    const d2 = dist2(npc.pos, t);
    if (d2 <= r2) nearbyThreats.push({ ...t, d2 });
  }
  nearbyThreats.sort((a, b) => a.d2 - b.d2);

  const nearbyFood = [];
  for (const f of world.foodPickups) {
    const d = manhattan(npc.pos, f);
    if (d <= radius) nearbyFood.push({ ...f, d });
  }
  nearbyFood.sort((a, b) => a.d - b.d);

  const nearbyRipeCrops = [];
  const ownedCropsNearby = [];
  let localCropCount = 0;
  let localRipeCount = 0;

  for (const c of world.crops) {
    const d = manhattan(npc.pos, c);
    if (d <= radius) {
      localCropCount++;
      if (c.state === CropStates.RIPE) {
        localRipeCount++;
        nearbyRipeCrops.push({ id: c.id, x: c.x, y: c.y, d, ownerId: c.ownerId });
      }
      if (c.ownerId === npc.id) {
        ownedCropsNearby.push({ id: c.id, x: c.x, y: c.y, d, state: c.state });
      }
    }
  }
  nearbyRipeCrops.sort((a, b) => a.d - b.d);
  ownedCropsNearby.sort((a, b) => a.d - b.d);

  const nearbyHunts = [];
  for (const h of world.huntingNodes) {
    if (!isHuntable(h)) continue;
    const d = manhattan(npc.pos, h);
    if (d <= radius) nearbyHunts.push({ id: h.id, x: h.x, y: h.y, d, risk: h.risk });
  }
  nearbyHunts.sort((a, b) => a.d - b.d);

  const threatSignal = nearbyThreats.length
    ? Math.min(1, nearbyThreats[0].danger)
    : 0;

  updateFear({ fear: npc.emotions.fear, threatSignal, config });

  const contract = contractManager?.getContractForNpc(npc) ?? null;
  const contractRef = contract ? makeContractRef(contract) : null;

  return makeObservationSpec({
    tick,
    self: {
      id: npc.id,
      pos: npc.pos,
      alive: npc.alive,
      needs: npc.needs,
      traits: npc.traits,
      emotions: npc.emotions,
      contract: contractRef
    },
    nearbyThreats,
    nearbyFood,
    nearbyRipeCrops,
    ownedCropsNearby,
    nearbyHunts,
    cropStats: {
      localCount: localCropCount,
      localRipeCount,
      globalCount: world.crops.length
    },
    world: { size: world.size }
  });
}
