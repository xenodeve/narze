import type { Track } from "@narze/shared";
import { SlashCommandBuilder } from "discord.js";
import { COLOR_SUCCESS, DEFAULT_ICON, escapeText, formatDuration, type Notice, trackLink } from "../music/format";
import type { Music } from "../music/music";
import { fail } from "./replies";
import type { Command } from "./types";

export const PAGE_SIZE = 10;
/** Ten rows at this title length keep the description well under Discord's 4096 characters. */
const TITLE_MAX = 80;
const pagesOf = (status: Status) => Math.max(1, Math.ceil(status.queue.length / PAGE_SIZE));

type Status = NonNullable<ReturnType<Music["status"]>>;

/** One page of /queue (spec #8): what is playing, ten queued tracks, and the total queue time. */
export function queuePage(status: Status, page: number): Notice {
  const current = status.current as Track;
  const icon = status.paused ? "`⏸️`┃" : status.playing ? "`▶️`┃" : "`⏹️`┃";
  const lines = [
    "**กำลังเล่น:**",
    `${icon} **${trackLink(current, TITLE_MAX)}** \` ${formatDuration(current.durationMs)} \``,
    `> **ศิลปิน:** ${escapeText(current.author)}`,
    "",
  ];
  const queue = status.queue;
  if (queue.length === 0) {
    lines.push("**คิวเพลง:** ` ว่างเปล่า `");
  } else {
    const pages = pagesOf(status);
    lines.push(`**คิวเพลง:** (${queue.length} เพลง${pages > 1 ? ` - หน้า ${page + 1}/${pages}` : ""})`);
    queue.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).forEach((t, i) => {
      lines.push(
        `**${page * PAGE_SIZE + i + 1})** **${trackLink(t, TITLE_MAX)}** \` ${formatDuration(t.durationMs)} \``,
      );
      lines.push(`> **ศิลปิน:** ${escapeText(t.author)}`);
    });
    const total = queue.reduce((sum, t) => sum + t.durationMs, 0);
    lines.push("", `**เวลารวมคิว:** \` ${formatDuration(total)} \``);
  }
  return {
    color: COLOR_SUCCESS,
    author: { name: "Go to Current Song", url: current.uri, iconUrl: current.requester.avatarUrl ?? DEFAULT_ICON },
    description: lines.join("\n"),
    thumbnailUrl: current.artworkUrl,
  };
}

export const queue: Command = {
  data: new SlashCommandBuilder().setName("queue").setDescription("แสดงเพลงที่กำลังเล่นและคิวทั้งหมด"),
  async run(ctx, music) {
    const status = music.status(ctx.guildId);
    if (!status?.current) return fail("ไม่มีเพลงกำลังเล่น");
    const pages = pagesOf(status);
    return {
      notice: queuePage(status, 0),
      ephemeral: false,
      pager:
        pages > 1
          ? {
              pages,
              // Recomputed on every click: the queue may have changed since the command ran.
              render: (page) => {
                const now = music.status(ctx.guildId);
                if (!now?.current) return null;
                const count = pagesOf(now);
                const shown = Math.min(page, count - 1);
                return { notice: queuePage(now, shown), page: shown, pages: count };
              },
            }
          : undefined,
    };
  },
};
