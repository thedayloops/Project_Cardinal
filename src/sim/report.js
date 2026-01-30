export function makeRunReport({ config, metrics, eventLog, world, npcs }) {
  const alive = npcs.filter(n => n.alive).length;
  const dead = npcs.length - alive;

  return {
    seed: config.seed,
    ticks: config.ticks,
    policyPack: config.policyPack,
    world: `${world.size.w}x${world.size.h}`,

    population: {
      alive,
      dead,
      total: npcs.length
    },

    environment: {
      crops: world.crops?.length ?? 0,
      foodPickups: world.foodPickups?.length ?? 0,
      threats: world.threats?.length ?? 0
    },

    metrics,
    recentEvents: readRecentEvents(eventLog, 30)
  };
}

export function formatRunReport(report) {
  const lines = [];

  lines.push("Run report");
  lines.push(`- seed: ${report.seed}`);
  lines.push(`- ticks: ${report.ticks}`);
  lines.push(`- policyPack: ${report.policyPack}`);
  lines.push(`- world: ${report.world}`);
  lines.push(
    `- population alive: ${report.population.alive}/${report.population.total}`
  );
  lines.push(`- deaths: ${report.population.dead}`);

  lines.push("");
  lines.push("Environment:");
  lines.push(`- crops: ${report.environment.crops}`);
  lines.push(`- food pickups: ${report.environment.foodPickups}`);
  lines.push(`- threats: ${report.environment.threats}`);

  lines.push("");
  lines.push("Recent events (last 30):");
  for (const e of report.recentEvents) {
    lines.push(`- [t${e.tick}] ${e.type} ${e.msg}`);
  }

  return lines.join("\n");
}

/* ================= helpers ================= */

function readRecentEvents(eventLog, n) {
  if (Array.isArray(eventLog)) {
    return eventLog.slice(-n);
  }

  if (Array.isArray(eventLog.events)) {
    return eventLog.events.slice(-n);
  }

  if (typeof eventLog.getRecent === "function") {
    return eventLog.getRecent(n);
  }

  return [];
}
