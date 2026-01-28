import { makePolicyPack } from "../sim/types.js";
import { baselinePolicyPack } from "./packs/baseline.js";

const packs = new Map([[baselinePolicyPack.id, baselinePolicyPack]]);

export function getPolicyPackById(id) {
  const pack = packs.get(id);
  if (!pack) throw new Error(`Unknown policyPack: ${id}`);
  return pack;
}

export function registerPolicyPack(pack) {
  packs.set(pack.id, pack);
}

// re-export helper
export { makePolicyPack };
