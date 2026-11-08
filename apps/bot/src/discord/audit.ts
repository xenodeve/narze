import { COLOR_SUCCESS, type Notice } from "../music/format";

/** Spec #13: what one command use looked like, for the log channel. */
export interface CommandUse {
  user: { id: string; tag: string; avatarUrl: string | null };
  voice: { name: string; id: string } | null;
  command: { name: string; id: string };
  channel: { name: string; id: string };
  guild: { name: string; id: string; iconUrl: string | null };
}

/** Names are user-chosen: a backtick would close the code span the line wraps them in. */
const plain = (text: string) => text.replaceAll("`", "ˋ");

/** Spec #13: v5's audit embed for `LOG_GUILD_ID` / `LOG_CHANNEL_ID`. */
export function auditNotice(use: CommandUse): Notice {
  return {
    color: COLOR_SUCCESS,
    author: {
      name: "View User",
      iconUrl: use.user.avatarUrl ?? undefined,
      url: `https://discord.com/users/${use.user.id}`,
    },
    description: [
      `User: \`${plain(use.user.tag)}\`(\`${use.user.id}\`)`,
      `UserChannel: \`${plain(use.voice?.name ?? "Not in voice")}\`(\`${use.voice?.id ?? "N/A"}\`)`,
      `Command: \`${use.command.name}\`(\`${use.command.id}\`)`,
      `Channel: \`${plain(use.channel.name)}\`(\`${use.channel.id}\`)`,
      `Server: \`${plain(use.guild.name)}\`(\`${use.guild.id}\`)`,
    ].join("\n"),
    thumbnailUrl: use.guild.iconUrl,
  };
}

/** Spec #34: the commands after which v5 sometimes pointed at the Dashboard. */
export const PROMO_COMMANDS = ["play", "skip", "pause", "volume", "loop", "clear", "seek", "247", "queue", "leave"];

/** 30 % of the time, after one of those commands (spec #13, #34). */
export const shouldPromo = (command: string, random: () => number = Math.random) =>
  PROMO_COMMANDS.includes(command) && random() < 0.3;

export function promoNotice(dashboardUrl: string): Notice {
  return {
    color: COLOR_SUCCESS,
    description: `-# สามารถควบคุมจาก [Dashboard](${dashboardUrl}) ได้แล้ว ง่ายกว่าใช้คำสั่งเยอะ ลองใช้เลย! \n - ${dashboardUrl}`,
  };
}
