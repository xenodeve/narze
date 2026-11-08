import type { Requester } from "@narze/shared";
import { formatDuration } from "../music/format";
import type { Music } from "../music/music";
import { type ConsoleCommand, USAGE } from "./parse";
import { type ConsoleGuild, findGuild, findText, findTextChannel, findVoice } from "./resolve";

/**
 * What the console needs: Discord's guilds, the music engine, and a place to print. No Redis and no
 * Backend, so it works the same in Standalone and Connected Mode (#112 AC3).
 */
export interface ConsoleDeps {
  guilds: () => ConsoleGuild[];
  music: Pick<Music, "play" | "leave" | "skip" | "status">;
  /** Console playback is requested by the Bot itself (v5: the bot member). */
  bot: Requester;
  print: (line: string) => void;
  clear: () => void;
}

export const HELP = [
  "คำสั่งของ Narze console",
  `  ${USAGE.play}`,
  `  ${USAGE.stop}            หยุดและออกจากห้อง (เหมือน leave)`,
  `  ${USAGE.skip}            ข้ามเพลงที่เล่นอยู่`,
  `  ${USAGE.leave}           ออกจากห้องเสียง`,
  "  status [เซิร์ฟเวอร์]          ดู player ทั้งหมด หรือของเซิร์ฟเวอร์เดียว",
  "  list | guilds              รายชื่อเซิร์ฟเวอร์ ห้องเสียง และช่องข้อความ",
  `  ${USAGE.find}`,
  "  help · clear · exit        exit ปิดแค่ console บอทยังทำงานต่อ",
  "เซิร์ฟเวอร์และช่องใส่ได้ทั้ง ID และชื่อ (บางส่วนของชื่อก็ได้ถ้าตรงอันเดียว)",
  "การเล่นจาก console เป็นโหมดเงียบ: ไม่โพสต์อะไรลง Discord จนกว่า player จะหยุด",
  'ตัวอย่าง: play "yoasobi idol" Lounge "Music Room"',
];

export function createConsole({ guilds, music, bot, print, clear }: ConsoleDeps) {
  const guildOf = (arg: string) => {
    const found = findGuild(guilds(), arg);
    if ("error" in found) print(found.error);
    return "error" in found ? null : found;
  };

  async function run(command: ConsoleCommand): Promise<void> {
    switch (command.kind) {
      case "empty":
      case "exit":
        return;
      case "usage":
        print(`ใช้แบบนี้: ${command.message}`);
        return;
      case "unknown":
        print(`ไม่รู้จักคำสั่ง "${command.word}" พิมพ์ help เพื่อดูคำสั่งทั้งหมด`);
        return;
      case "help":
        for (const line of HELP) print(line);
        return;
      case "clear":
        clear();
        return;
      case "play": {
        const guild = guildOf(command.guild);
        if (!guild) return;
        const voice = findVoice(guild, command.voice);
        if ("error" in voice) return print(voice.error);
        const text = findText(guild, command.text);
        if ("error" in text) return print(text.error);
        if (command.text === null) print(`เลือกช่องข้อความให้อัตโนมัติ: #${text.name}`);
        const result = await music.play({
          guildId: guild.id,
          voiceChannelId: voice.id,
          textChannelId: text.id,
          query: command.query,
          requester: bot,
          silent: true,
        });
        switch (result.kind) {
          case "started":
            return print(
              `กำลังเล่น ${result.track.title} (${formatDuration(result.track.durationMs)}) ใน ${guild.name} · ${voice.name} · โหมดเงียบ`,
            );
          case "queued":
            return print(`เข้าคิวลำดับ ${result.position}: ${result.track.title}`);
          case "playlist":
            return print(
              `เพิ่ม playlist ${result.playlist.name} ${result.playlist.count} เพลง (${formatDuration(result.playlist.durationMs)})`,
            );
          case "error":
            return print(result.reason === "not-found" ? "ไม่พบเพลงที่ค้นหา" : `เล่นไม่ได้ (${result.reason})`);
        }
        return;
      }
      case "stop":
      case "leave": {
        const guild = guildOf(command.guild);
        if (!guild) return;
        print((await music.leave(guild.id)) ? `ออกจากห้องเสียงใน ${guild.name} แล้ว` : `ไม่มี player ใน ${guild.name}`);
        return;
      }
      case "skip": {
        const guild = guildOf(command.guild);
        if (!guild) return;
        const result = await music.skip(guild.id);
        print(result === null ? `ไม่มีเพลงที่เล่นอยู่ใน ${guild.name}` : `ข้ามเพลงใน ${guild.name} แล้ว`);
        return;
      }
      case "status": {
        if (command.guild !== null) {
          const guild = guildOf(command.guild);
          if (!guild) return;
          const status = music.status(guild.id);
          if (!status) return print(`ไม่มี player ใน ${guild.name}`);
          print(`${guild.name}: ${status.current?.title ?? "ไม่มีเพลง"} ${status.paused ? "(หยุดชั่วคราว)" : ""}`.trim());
          print(
            `  ${formatDuration(status.positionMs)} / ${formatDuration(status.current?.durationMs ?? 0)} · ระดับเสียง ${status.volume} · คิว ${status.queue.length} เพลง`,
          );
          return;
        }
        const players = guilds()
          .map((g) => ({ guild: g, status: music.status(g.id) }))
          .filter((p) => p.status !== null);
        if (players.length === 0) return print("ไม่มี player ที่ทำงานอยู่");
        for (const { guild, status } of players) {
          const state = status?.paused ? "หยุดชั่วคราว" : status?.playing ? "กำลังเล่น" : "ว่าง";
          print(
            `${guild.name} (${guild.id}): ${status?.current?.title ?? "ไม่มีเพลง"} · ${state} · คิว ${status?.queue.length ?? 0}`,
          );
        }
        return;
      }
      case "list": {
        for (const guild of guilds()) {
          print(`${guild.name} (${guild.id})`);
          for (const c of guild.channels) {
            print(
              c.kind === "voice"
                ? `  🔊 ${c.name} (${c.id}) · ${c.members ?? 0} คน`
                : `  # ${c.name} (${c.id}) ${c.canSend ? "✅" : "❌ ส่งไม่ได้"}`,
            );
          }
        }
        return;
      }
      case "find": {
        if (command.what === "guild") {
          const found = findGuild(guilds(), command.name);
          return print("error" in found ? found.error : `${found.name} (${found.id})`);
        }
        const guild = guildOf(command.guild);
        if (!guild) return;
        const found = command.what === "voice" ? findVoice(guild, command.name) : findTextChannel(guild, command.name);
        if ("error" in found) return print(found.error);
        print(
          `${found.name} (${found.id})${found.kind === "text" ? ` ${found.canSend ? "✅ ส่งได้" : "❌ ส่งไม่ได้"}` : ""}`,
        );
        return;
      }
    }
  }

  return { run };
}
