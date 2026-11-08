"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import styles from "./mood-aurora.module.css";

const Aurora = dynamic(() => import("@/components/vendor/aurora/Aurora"), { ssr: false });

/**
 * Whether the WebGL Aurora may run (DESIGN.md §8): WebGL2 present, and not `?fx=0`, reduced
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

/** The one ambient canvas on the player page, coloured from the mood; behind the stage, never in front. */
export function MoodAurora({ mood, paused }: { mood: string; paused: boolean }) {
  const [animate, setAnimate] = useState(false);
  useEffect(() => setAnimate(canAnimate()), []);

  return (
    <div className={styles.layer} aria-hidden="true" data-fx={animate ? "aurora" : "wash"} data-paused={paused}>
      {animate ? (
        <Aurora colorStops={[mood, "#5aa2ff", mood]} amplitude={0.9} blend={0.6} speed={0.6} paused={paused} />
      ) : (
        <div className={styles.wash} />
      )}
    </div>
  );
}
