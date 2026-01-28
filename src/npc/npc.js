import { makeNeeds } from "./needs.js";
import { makeTraits } from "./traits.js";
import { makeFear } from "./emotions/fear.js";

export function makeNpc({ id, rng, worldSize }) {
  return {
    id,
    alive: true,
    pos: {
      x: rng.int(0, worldSize.w - 1),
      y: rng.int(0, worldSize.h - 1)
    },
    needs: makeNeeds(rng),
    traits: makeTraits(rng),
    emotions: {
      fear: makeFear()
    },
    memory: {
      // reserved for later slices (contracts, landmarks, etc.)
      lastAction: null
    }
  };
}
