export function makeHuntingNode({
  id,
  x,
  y,
  yieldAmount = 3,
  risk = 0.08,
  respawnTicks = 60
}) {
  return {
    id,
    x,
    y,
    yieldAmount,
    risk,
    respawnTicks,
    cooldown: 0
  };
}

export function tickHuntingNode(node) {
  if (node.cooldown > 0) node.cooldown -= 1;
}

export function isHuntable(node) {
  return node.cooldown <= 0;
}
