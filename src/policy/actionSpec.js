import { ActionKinds, makeActionSpec } from "../sim/types.js";

/**
 * Canonical ActionSpec constructors.
 * Policies must ONLY construct actions via this object.
 */
export const Actions = {
  move(dx, dy) {
    return makeActionSpec(ActionKinds.MOVE, { dx, dy });
  },

  moveToward(from, to) {
    const dx = Math.sign(to.x - from.x);
    const dy = Math.sign(to.y - from.y);
    return makeActionSpec(ActionKinds.MOVE, { dx, dy });
  },

  rest() {
    return makeActionSpec(ActionKinds.REST);
  },

  eat() {
    return makeActionSpec(ActionKinds.EAT);
  },

  flee(dx, dy) {
    return makeActionSpec(ActionKinds.FLEE, { dx, dy });
  },

  investigate() {
    return makeActionSpec(ActionKinds.INVESTIGATE);
  },

  harvest() {
    return makeActionSpec(ActionKinds.HARVEST);
  },

  hunt(targetId) {
    return makeActionSpec(ActionKinds.HUNT, { targetId });
  }
};
