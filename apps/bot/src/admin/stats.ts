/**
 * Spec #109: CPU % as the process's share of every core over the window since the previous reading,
 * rounded to 0.1. Each reading says when it was taken and over what window.
 */
export function createCpuMeter(read: {
  now: () => number;
  /** process.cpuUsage() user + system, in microseconds. */
  cpuMicros: () => number;
  cores: number;
}) {
  let last = { at: read.now(), cpu: read.cpuMicros() };
  return (): { at: number; windowMs: number; cpuPercent: number } => {
    const at = read.now();
    const cpu = read.cpuMicros();
    const windowMs = Math.max(1, at - last.at);
    const share = (cpu - last.cpu) / 1000 / (windowMs * Math.max(1, read.cores));
    last = { at, cpu };
    return { at, windowMs, cpuPercent: Math.round(Math.max(0, share) * 1000) / 10 };
  };
}
