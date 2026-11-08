import type { TextChannelList, VoiceChannelList } from "@narze/shared";
import { ChannelType, type Guild, PermissionFlagsBits } from "discord.js";

/**
 * The picker's view of one Guild (spec #86): voice channels every member can see, and the people
 * (not bots) in each. Hidden channels are left out, so their members are not shown to the whole
 * server through the Dashboard.
 */
export function publicVoiceChannels(guild: Guild): VoiceChannelList {
  const everyone = guild.roles.everyone;
  return guild.channels.cache
    .filter((c) => c.isVoiceBased() && Boolean(c.permissionsFor(everyone)?.has(PermissionFlagsBits.ViewChannel)))
    .map((c) => ({
      id: c.id,
      name: c.name,
      members: c.isVoiceBased()
        ? c.members
            .filter((m) => !m.user.bot)
            .map((m) => ({ id: m.id, name: m.displayName, avatarUrl: m.displayAvatarURL({ size: 64 }) }))
        : [],
    }));
}

/** Text channels the Bot may view and post in, in their sidebar order (#106 Music Channel picker). */
export function sendableTextChannels(guild: Guild): TextChannelList {
  const me = guild.members.me;
  if (!me) return [];
  return guild.channels.cache
    .filter(
      (c) =>
        c.type === ChannelType.GuildText &&
        Boolean(c.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])),
    )
    .sort((a, b) => ("position" in a && "position" in b ? a.position - b.position : 0))
    .map((c) => ({ id: c.id, name: c.name }));
}

/** The first text channel the Bot may post in: where notices go for a Dashboard-started player without a Music Channel. */
export function firstSendableTextChannel(guild: Guild): string | null {
  return sendableTextChannels(guild)[0]?.id ?? null;
}

/**
 * Runs `publish(guildId)` at most once per `ms` per Guild, with the latest state (trailing, unlike
 * v5 which dropped updates). `cancel` forgets a Guild the Bot left, so nothing is re-published for it.
 */
export function perGuildDebounce(publish: (guildId: string) => Promise<void>, ms = 1000) {
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  return {
    schedule(guildId: string): void {
      if (pending.has(guildId)) return;
      pending.set(
        guildId,
        setTimeout(() => {
          pending.delete(guildId);
          // A timer callback that throws would exit Bun; publishing is best-effort.
          publish(guildId).catch((error: unknown) =>
            console.warn(`[bot] voice channels: ${error instanceof Error ? error.message : String(error)}`),
          );
        }, ms),
      );
    },
    cancel(guildId: string): void {
      clearTimeout(pending.get(guildId));
      pending.delete(guildId);
    },
  };
}
