/**
 * Entity Registry (Slice 5)
 * A lightweight, deterministic index of NPC state so policies/observations can
 * resolve NPC-to-NPC references (e.g., escort leader position) without exposing
 * sim internals.
 *
 * This is intentionally small and “read-only” from policy perspective.
 */

export function makeEntityRegistry() {
  return {
    npcById: new Map(),
    tick: 0
  };
}

export function rebuildEntityRegistry(registry, npcs, tick) {
  registry.tick = tick;
  registry.npcById.clear();

  for (const npc of npcs) {
    registry.npcById.set(npc.id, {
      id: npc.id,
      alive: npc.alive,
      x: npc.pos.x,
      y: npc.pos.y,
      contractId: npc.contractId ?? null
    });
  }
}

export function getNpcEntity(registry, npcId) {
  return registry.npcById.get(npcId) ?? null;
}

export function listAliveNpcEntities(registry) {
  const out = [];
  for (const e of registry.npcById.values()) {
    if (e.alive) out.push(e);
  }
  return out;
}
