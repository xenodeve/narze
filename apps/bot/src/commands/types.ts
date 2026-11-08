import type { Requester } from "@narze/shared";
import type { SlashCommandOptionsOnlyBuilder } from "discord.js";
import type { Notice } from "../music/format";
import type { Music } from "../music/music";

/** What a command needs from Discord, so handlers are testable without discord.js. */
export interface CommandContext {
  guildId: string;
  /** The text channel the command was used in (where notices for this player go). */
  channelId: string;
  user: Requester;
  memberVoiceChannelId: string | null;
  /** ViewChannel + Connect + Speak, and the user limit unless the Bot can manage the channel (spec #11). */
  canSpeakIn(channelId: string): boolean;
  option(name: string): string | number | null;
  latencyMs: { reply: number; ws: number };
}

export interface Reply {
  notice: Notice;
  /** Errors are private, successes public (spec #14). */
  ephemeral: boolean;
}

export interface Command {
  data: SlashCommandOptionsOnlyBuilder;
  /** The handler may take longer than Discord's 3 s reply window (search, voice join): defer first. */
  slow?: boolean;
  run(ctx: CommandContext, music: Music): Promise<Reply>;
}
