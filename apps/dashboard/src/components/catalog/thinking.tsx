"use client";

import dynamic from "next/dynamic";
import styles from "./thinking.module.css";

// DESIGN.md: the ThinkingOrb replaces every spinner for an in-flight remote step. Canvas: client-only.
const ThinkingOrb = dynamic(() => import("thinking-orbs").then((m) => m.ThinkingOrb), { ssr: false });

/** `searching` while a remote step is in flight, announced to screen readers by `label`. */
export function Thinking({ label, size = 20 }: { label: string; size?: 20 | 64 }) {
  return (
    <span role="status" aria-label={label} className={styles.thinking}>
      <ThinkingOrb state="searching" size={size} />
    </span>
  );
}
