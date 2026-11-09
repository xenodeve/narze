"use client";

import { useState } from "react";
import styles from "./guild-icon.module.css";

/**
 * A server's own Discord icon (#166, #170): a rounded square whose radius is a quarter of its size
 * (DESIGN.md). A server without an icon, or one the CDN cannot serve, shows its first letter.
 * Every list of servers uses this, so they read the same everywhere.
 */
export function GuildIcon({
  guildId,
  name,
  iconUrl,
  size,
  testId = "guild-icon",
  monogramTestId = "guild-icon-monogram",
}: {
  guildId?: string;
  name: string;
  iconUrl: string | null | undefined;
  size: number;
  testId?: string;
  monogramTestId?: string;
}) {
  const [broken, setBroken] = useState(false);
  const box = { width: size, height: size, borderRadius: size / 4 };
  if (iconUrl && !broken) {
    return (
      // biome-ignore lint/performance/noImgElement: a small guild icon from Discord's CDN; next/image would add remote-pattern config for no gain
      <img
        className={styles.icon}
        style={box}
        src={iconUrl}
        width={size}
        height={size}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        data-testid={testId}
        data-guild-id={guildId}
      />
    );
  }
  return (
    <span
      className={styles.monogram}
      style={{ ...box, fontSize: Math.max(11, Math.round(size * 0.42)) }}
      aria-hidden="true"
      data-testid={monogramTestId}
      data-guild-id={guildId}
    >
      {Array.from(name.trim())[0]?.toUpperCase() ?? "?"}
    </span>
  );
}
