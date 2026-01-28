import { summarizeMetrics } from "./metrics.js";

export function makeRunReport({ config, metrics, eventLog, world, npcs }) {
  return {
    meta: {
      seed: config.seed,
      ticks: config.ticks,
      dt: config.dt,
      policyPack: config.policyPack
    },
    world: {
      size: world.size,
      foodCount: world.food.length,
      threats: world.threats.length
    },
    population: {
      initial: config.npcCount,
      alive: npcs.filter(n => n.alive).length
    },
    metrics: summarizeMetrics(metrics),
    recentEvents: eventLog.items.slice(-30)
  };
}

export function formatRunReport(report) {
  const lines = [];
  lines.push(`Run report`);
  lines.push(`- seed: ${report.meta.seed}`);
  lines.push(`- ticks: ${report.meta.ticks}`);
  lines.push(`- policyPack: ${report.meta.policyPack}`);
  lines.push(`- world: ${report.world.size.w}x${report.world.size.h}`);
  lines.push(`- threats: ${report.world.threats}, food: ${report.world.foodCount}`);
  lines.push(`- population alive: ${report.population.alive}/${report.population.initial}`);
  lines.push(`- deaths: ${report.metrics.totals.deaths}`);

  lines.push(`\nAction totals:`);
  const keys = Object.keys(report.metrics.totals.actions).sort();
  for (const k of keys) lines.push(`- ${k}: ${report.metrics.totals.actions[k]}`);

  lines.push(`\nRecent events (last ${report.recentEvents.length}):`);
  for (const e of report.recentEvents) {
    lines.push(`- [t${e.tick}] ${e.type} ${e.msg ?? ""}`.trim());
  }
  return lines.join("\n");
}
