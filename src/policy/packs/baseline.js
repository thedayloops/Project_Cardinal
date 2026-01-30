import { makePolicyPack } from "../policyPack.js";
import { Actions } from "../actionSpec.js";
import { softmaxPick } from "../selectors/softmax.js";

export const baselinePolicyPack = makePolicyPack({
  id: "baseline",
  version: "0.3.6-dev",

  selectAction({ obs, rng }) {
    const scored = [];

    const hunger = obs.self.needs.hunger;
    const fatigue = obs.self.needs.fatigue;
    const fear = obs.self.emotions.fear.value;
    const curiosity = obs.self.traits.curiosity ?? 0.5;

    const nearbyFood = Array.isArray(obs.nearbyFood) ? obs.nearbyFood : [];
    const ownedCropsNearby = Array.isArray(obs.ownedCropsNearby) ? obs.ownedCropsNearby : [];
    const nearbyRipeCrops = Array.isArray(obs.nearbyRipeCrops) ? obs.nearbyRipeCrops : [];
    const nearbyHunts = Array.isArray(obs.nearbyHunts) ? obs.nearbyHunts : [];

    const cropStats = obs.cropStats ?? { localCount: 0, localRipeCount: 0, globalCount: 0 };

    // Eat
    if (nearbyFood.length > 0) {
      scored.push({ item: Actions.eat(), score: 1.8 * hunger });
    }

    // Rest
    scored.push({ item: Actions.rest(), score: 1.1 * fatigue });

    // Harvest owned ripe crop
    if (ownedCropsNearby.length && ownedCropsNearby[0].d === 0) {
      scored.push({ item: Actions.harvest(), score: 3.6 });
    }

    // Harvest any ripe crop if very hungry
    if (nearbyRipeCrops.length && nearbyRipeCrops[0].d === 0) {
      scored.push({ item: Actions.harvest(), score: 2.3 * hunger });
    }

    // Guard/wait near owned unripe crops
    const ownsUnripeNearby = ownedCropsNearby.length > 0 && cropStats.localRipeCount === 0;
    if (ownsUnripeNearby && hunger < 0.6) {
      scored.push({ item: Actions.rest(), score: 1.9 * (1 - hunger) });
      scored.push(...microMoves(0.35 * (1 - hunger)));
    }

    // HUNT as buffer when hungry and farms not ready
    if (nearbyHunts.length > 0 && hunger > 0.35 && cropStats.localRipeCount === 0) {
      const h = nearbyHunts[0];
      const riskPenalty = Math.max(0.2, 1 - h.risk * 3) * (1 - fear);
      scored.push({
        item: Actions.hunt(h.id),
        score: (1.4 * hunger) * riskPenalty
      });
    }

    // Planting (investment)
    const noLocal = cropStats.localCount === 0;
    const lowGlobal = cropStats.globalCount < 0.15 * 160;
    if (hunger > 0.18 && (noLocal || lowGlobal)) {
      scored.push({
        item: Actions.investigate(),
        score: (0.6 + hunger) * (noLocal ? 1.4 : 0.7)
      });
    }

    // Curiosity bootstrap
    if (cropStats.globalCount === 0 && curiosity > 0.35) {
      scored.push({
        item: Actions.investigate(),
        score: curiosity * 0.9 * (1 - hunger) * (1 - fear)
      });
    }

    scored.push(...randomMoves(0.08));

    return softmaxPick({
      rng,
      scored,
      temperature: 0.7 + fear
    });
  }
});

function randomMoves(score) {
  const dirs = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 }
  ];
  return dirs.map(d => ({ item: Actions.move(d.dx, d.dy), score }));
}

function microMoves(score) {
  return randomMoves(score);
}
