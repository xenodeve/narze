"use client";

import { type AvatarOutfit, DEFAULT_OUTFIT } from "@narze/shared";
import dynamic from "next/dynamic";

const BotAvatar = dynamic(() => import("bot-avatars").then((m) => m.BotAvatar), { ssr: false });

/**
 * A Guild's Bot Avatar in its outfit (#106) — one component for every place it appears (Now
 * Playing, server list, the settings preview; the sidebar shows the server's own icon, #166). The outfit is also on data attributes: the
 * avatar is a canvas, and tests and tools read what it wears from there.
 */
export function GuildAvatar({
  outfit = DEFAULT_OUTFIT,
  size,
  state = "default",
  color,
  testId,
  guildId,
}: {
  outfit?: AvatarOutfit;
  size: number;
  state?: "default" | "working" | "sleeping";
  color?: string;
  testId?: string;
  guildId?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-testid={testId}
      data-guild-id={guildId}
      data-type={outfit.type}
      data-hat={outfit.hat}
      data-glasses={outfit.glasses}
      style={{ display: "inline-grid", width: size, height: size }}
    >
      <BotAvatar
        type={outfit.type}
        size={size}
        state={state}
        hat={outfit.hat}
        glasses={outfit.glasses}
        headphones={outfit.headphones}
        bowTie={outfit.bowTie}
        accessoryColor={outfit.accessoryColor}
        color={color}
      />
    </span>
  );
}
