import type { Track } from "@narze/shared";
import { SlashCommandBuilder } from "discord.js";
import { COLOR_SUCCESS, DEFAULT_ICON, formatDuration, type Notice } from "../music/format";
import type { Music } from "../music/music";
import { fail } from "./replies";
import type { Command } from "./types";

export const PAGE_SIZE = 10;

type Status = NonNullable<ReturnType<Music["status"]>>;

/** One page of /queue (spec #8): what is playing, ten queued tracks, and the total queue time. */
export function queuePage(status: Status, page: number): Notice {
  const current = status.current as Track;
  const icon = status.paused ? "`⏸️`┃" : status.playing ? "`▶️`┃" : "`⏹️`┃";
  const lines = [
    "**กำลังเล่น:**",
    `${icon} **[${current.title}](${current.uri})** \` ${formatDuration(current.durationMs)} \``,
    `> **ศิลปิน:** ${current.author}`,
    "",
  ];
  const queue = status.queue;
  if (queue.length === 0) {
    lines.push("**คิวเพลง:** ` ว่างเปล่า `");
  } else {
    const pages = Math.ceil(queue.length / PAGE_SIZE);
    lines.push(`**คิวเพลง:** (${queue.length} เพลง${pages > 1 ? ` - หน้า ${page + 1}/${pages}` : ""})`);
    queue.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).forEach((t, i) => {
      lines.push(`**${page * PAGE_SIZE + i + 1})** **[${t.title}](${t.uri})** \` ${formatDuration(t.durationMs)} \``);
      lines.push(`> **ศิลปิน:** ${t.author}`);
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
    const pages = Math.ceil(status.queue.length / PAGE_SIZE);
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
                return now?.current
                  ? queuePage(now, Math.min(page, Math.ceil(now.queue.length / PAGE_SIZE) - 1))
                  : null;
              },
            }
          : undefined,
    };
  },
};
