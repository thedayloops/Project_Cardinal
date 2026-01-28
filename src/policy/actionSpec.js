import { ActionKinds, makeActionSpec } from "../sim/types.js";

export const Actions = {
  move(dx, dy) {
    return makeActionSpec(ActionKinds.MOVE, { dx, dy });
  },
  rest() {
    return makeActionSpec(ActionKinds.REST);
  },
  eat() {
    return makeActionSpec(ActionKinds.EAT);
  },
  investigate() {
    return makeActionSpec(ActionKinds.INVESTIGATE);
  },
  flee() {
    return makeActionSpec(ActionKinds.FLEE);
  },
  idle() {
    return makeActionSpec(ActionKinds.IDLE);
  }
};
