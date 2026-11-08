"use client";

/**
 * Whether a WebGL canvas (the Aurora, the voice sheet's Strands) may run (DESIGN.md §8): WebGL2 present, and not `?fx=0`, reduced
 * motion, a low-memory device or Save-Data. Otherwise the stage shows a flat `--mood` wash.
 */
export function canAnimate(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (new URLSearchParams(window.location.search).get("fx") === "0") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if ((nav.deviceMemory ?? 8) <= 2 || nav.connection?.saveData) return false;
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}
