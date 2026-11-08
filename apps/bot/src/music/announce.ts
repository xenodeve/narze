import type { Track } from "@narze/shared";
import { COLOR_SUCCESS, DEFAULT_ICON, formatDuration, type Notice } from "./format";

/** Player flags that decide whether a track start is announced (spec #15, #24, #25). */
export interface AnnounceFlags {
  /** Set by /play for the track it starts; its own reply announces it. */
  firstFromCommand: boolean;
  /** /skipplay started this track. */
  skipplay: boolean;
  /** /skip caused this start (it overrides a track-loop repeat). */
  skip: boolean;
  /** /playnext or /playat started this track immediately. */
  dontShow: boolean;
  /** Playback started from the operator console: log only. */
  terminal: boolean;
  /** Loop mode is "track", so this start is a repeat. */
  trackLoop: boolean;
}

export const NO_FLAGS: AnnounceFlags = {
  firstFromCommand: false,
  skipplay: false,
  skip: false,
  dontShow: false,
  terminal: false,
  trackLoop: false,
};

/** v5's rule (spec #24), with terminal playback never announced. */
export function shouldAnnounce(flags: AnnounceFlags, queueSize: number): boolean {
  if (flags.terminal || flags.dontShow || flags.skipplay) return false;
  const actualFirst = flags.firstFromCommand && queueSize === 0;
  if (actualFirst) return false;
  return !flags.trackLoop || flags.skip;
}

/** The embed posted when a track starts (spec #23): one new message per track, never edited. */
export function nowPlayingNotice(track: Track): Notice {
  const lines = [`\`▶️\`┃**${track.title}** \` ${formatDuration(track.durationMs)} \``];
  lines.push(`> Requested by <@${track.requester.id}>`);
  return {
    color: COLOR_SUCCESS,
    author: { name: "Go to Page", url: track.uri, iconUrl: track.requester.avatarUrl ?? DEFAULT_ICON },
    description: lines.join("\n"),
    thumbnailUrl: track.artworkUrl,
  };
}

/** Posted where the Player's notices go when Queue Recovery brings it back (#103); replaces Now Playing. */
export function recoveryNotice(track: Track | null, positionMs: number, queued: number): Notice {
  const what = track
    ? `เล่นต่อ **${track.title}** \` ${formatDuration(positionMs)} \` · คิวอีก \` ${queued} \` เพลง`
    : "กลับเข้าห้องเสียงแล้ว (24/7)";
  return { color: COLOR_SUCCESS, description: `\`🔄\`┃**กู้คิวเพลงหลังบอทรีสตาร์ท** ${what}` };
}
