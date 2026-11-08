import type { AdminStats } from "@narze/shared";

/**
 * Spec #109 stats, one sample at a time. CPU % is the process's share of every core over the window
 * since the previous sample; each sample says when it was taken and over what window.
 */
export function createStatsSampler(read: {
  now: () => number;
  /** process.cpuUsage() user + system, in microseconds. */
  cpuMicros: () => number;
  cores: () => number;
  memory: () => AdminStats["memory"];
  uptimeMs: () => number;
  online: () => boolean;
  pingMs: () => number | null;
  guilds: () => number;
  activePlayers: () => number;
  caches: () => AdminStats["caches"];
}) {
  let last = { at: read.now(), cpu: read.cpuMicros() };
  return {
    sample(): AdminStats {
      const at = read.now();
      const cpu = read.cpuMicros();
      const windowMs = Math.max(1, at - last.at);
      const share = (cpu - last.cpu) / 1000 / (windowMs * Math.max(1, read.cores()));
      last = { at, cpu };
      return {
        at,
        windowMs,
        online: read.online(),
        pingMs: read.pingMs(),
        uptimeMs: read.uptimeMs(),
        guilds: read.guilds(),
        activePlayers: read.activePlayers(),
        cpuPercent: Math.round(Math.max(0, share) * 1000) / 10,
        memory: read.memory(),
        caches: read.caches(),
      };
    },
  };
}
