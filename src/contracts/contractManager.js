import { ContractKinds } from "./contractTypes.js";
import { manhattan } from "../sim/world.js";

export function makeContractManager({ rng, config, world, npcs }) {
  const mgr = {
    contracts: [],
    byNpcId: new Map(), // npcId -> contractId

    init() {
      if (!config.contracts?.enabled) return;

      const alive = npcs.filter(n => n.alive);
      const pool = alive.map(n => n.id);

      // deterministic shuffle
      const shuffled = pool
        .map(id => ({ id, r: rng.next() }))
        .sort((a, b) => a.r - b.r)
        .map(x => x.id);

      let cursor = 0;

      cursor = formContracts({
        mgr,
        rng,
        config,
        world,
        npcs,
        kind: ContractKinds.PATROL,
        spec: config.contracts.patrol,
        shuffled,
        cursor
      });

      cursor = formContracts({
        mgr,
        rng,
        config,
        world,
        npcs,
        kind: ContractKinds.HUNT,
        spec: config.contracts.hunt,
        shuffled,
        cursor
      });

      cursor = formContracts({
        mgr,
        rng,
        config,
        world,
        npcs,
        kind: ContractKinds.ESCORT,
        spec: config.contracts.escort,
        shuffled,
        cursor
      });

      // build lookup + attach to NPCs
      for (const c of mgr.contracts) {
        for (const id of c.memberIds) mgr.byNpcId.set(id, c.id);
      }
      for (const npc of npcs) {
        npc.contractId = mgr.byNpcId.get(npc.id) ?? null;
      }
    },

    tick({ tick }) {
      if (mgr.contracts.length === 0) return;

      for (const c of mgr.contracts) {
        // prune dead members
        c.memberIds = c.memberIds.filter(id => isAlive(npcs, id));
        if (c.memberIds.length === 0) continue;

        // replace leader if dead
        if (!isAlive(npcs, c.leaderId)) {
          c.leaderId = c.memberIds[0];
        }

        if (c.kind === ContractKinds.PATROL) {
          advancePatrolIfNeeded({ c, npcs });
        }

        // keep byNpcId fresh (cheap at these scales)
        for (const id of c.memberIds) mgr.byNpcId.set(id, c.id);
      }

      // clear contractId for dead NPCs
      for (const npc of npcs) {
        if (!npc.alive) {
          npc.contractId = null;
        }
      }
    },

    getContractForNpc(npc) {
      if (!npc.contractId) return null;
      return mgr.contracts.find(c => c.id === npc.contractId) ?? null;
    }
  };

  mgr.init();
  return mgr;
}

function formContracts({ mgr, rng, config, world, kind, spec, shuffled, cursor }) {
  if (!spec?.enabled) return cursor;

  const fraction = clamp01(spec.fraction ?? 0);
  const targetCount = Math.floor(config.npcCount * fraction);

  const groupSize = Math.max(2, Math.floor(spec.groupSize ?? 3));
  const maxGroups = Math.floor(targetCount / groupSize);
  if (maxGroups <= 0) return cursor;

  for (let g = 0; g < maxGroups; g++) {
    if (cursor + groupSize > shuffled.length) break;

    const memberIds = shuffled.slice(cursor, cursor + groupSize);
    cursor += groupSize;

    const leaderId = memberIds[0];
    mgr.contracts.push(makeContract({ rng, world, kind, leaderId, memberIds, spec }));
  }

  return cursor;
}

function makeContract({ rng, world, kind, leaderId, memberIds, spec }) {
  const id = `${kind.toLowerCase()}_${leaderId}`;

  if (kind === ContractKinds.PATROL) {
    const routeLen = Math.max(2, Math.floor(spec.routeLen ?? 4));
    const route = [];
    for (let i = 0; i < routeLen; i++) {
      route.push({
        x: rng.int(0, world.size.w - 1),
        y: rng.int(0, world.size.h - 1)
      });
    }
    return {
      id,
      kind,
      leaderId,
      memberIds,
      patrol: {
        route,
        index: 0,
        waypointRadius: Math.max(1, Math.floor(spec.waypointRadius ?? 2))
      }
    };
  }

  if (kind === ContractKinds.HUNT) {
    return {
      id,
      kind,
      leaderId,
      memberIds,
      hunt: {
        huntRadius: Math.max(2, Math.floor(spec.huntRadius ?? 6))
      }
    };
  }

  // ESCORT
  return {
    id,
    kind,
    leaderId,
    memberIds,
    escort: {
      followRadius: Math.max(1, Math.floor(spec.followRadius ?? 2))
    }
  };
}

function advancePatrolIfNeeded({ c, npcs }) {
  const leader = npcs.find(n => n.id === c.leaderId);
  if (!leader) return;

  const waypoint = c.patrol.route[c.patrol.index];
  const d = manhattan(leader.pos, waypoint);

  if (d <= c.patrol.waypointRadius) {
    c.patrol.index = (c.patrol.index + 1) % c.patrol.route.length;
  }
}

function isAlive(npcs, id) {
  const n = npcs.find(x => x.id === id);
  return Boolean(n && n.alive);
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}
