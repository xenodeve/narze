import { describe, expect, mock, test } from "bun:test";
import type { GuildSettings } from "@narze/shared";
import { DEFAULT_OUTFIT } from "@narze/shared";
import { auditNotice, PROMO_COMMANDS, promoNotice, shouldPromo } from "../src/discord/audit";
import { createGuildSettings, inviterOf, type SettingsStore, WELCOME } from "../src/settings/guild-settings";

function memoryStore(rows: GuildSettings[] = []): SettingsStore & { rows: Map<string, GuildSettings> } {
  const map = new Map(rows.map((r) => [r.guildId, r]));
  return {
    rows: map,
    get: async (guildId) => map.get(guildId) ?? null,
    ensure: async ({ guildId, guildName, ownerId }) => {
      const old = map.get(guildId);
      // A re-invite keeps the first owner, the Music Channel and the outfit.
      map.set(guildId, {
        guildId,
        guildName,
        ownerId: old?.ownerId ?? ownerId,
        musicChannelId: old?.musicChannelId ?? null,
        avatar: old?.avatar ?? DEFAULT_OUTFIT,
      });
    },
    setMusicChannel: async (guildId, channelId) => {
      const old = map.get(guildId);
      if (old) map.set(guildId, { ...old, musicChannelId: channelId });
    },
  };
}

describe("Bot Owner on join (#106, spec #22, #121)", () => {
  test("the inviter from the audit log's BotAdd entry for this Bot; otherwise the Server Owner", async () => {
    const adds = async () => [
      { targetId: "other-bot", executorId: "1" },
      { targetId: "me", executorId: "2" },
    ];
    expect(await inviterOf(adds, "me")).toBe("2");
    expect(await inviterOf(async () => [], "me")).toBeNull();
    expect(await inviterOf(async () => Promise.reject(new Error("Missing Permissions")), "me")).toBeNull();
  });

  test("joining records the owner once; a re-invite keeps it and the Music Channel", async () => {
    const store = memoryStore([
      { guildId: "9", guildName: "Old", ownerId: "1", musicChannelId: "55", avatar: DEFAULT_OUTFIT },
    ]);
    const settings = createGuildSettings(store);
    await settings.join({ id: "9", name: "Club", ownerId: "7" }, "3");
    expect(store.rows.get("9")).toMatchObject({ ownerId: "1", guildName: "Club", musicChannelId: "55" });
    await settings.join({ id: "8", name: "New", ownerId: "7" }, null);
    expect(store.rows.get("8")?.ownerId).toBe("7");
  });

  test("the welcome is v5's, without the /help line (there is no /help)", () => {
    expect(WELCOME).toBe(
      "👋 **สวัสดี!** ขอบคุณที่เชิญฉันเข้ามา!\n\n🎵 ใช้คำสั่ง `/play <เพลง>` เพื่อเล่นเพลง\n⚙️ ใช้คำสั่ง `/setchannel` เพื่อตั้งค่า Music Channel",
    );
  });
});

describe("the Music Channel the Bot posts in (#106, spec #12)", () => {
  test("known once loaded or set, and kept fresh by a settings update", async () => {
    const store = memoryStore([
      { guildId: "9", guildName: "C", ownerId: "1", musicChannelId: "55", avatar: DEFAULT_OUTFIT },
    ]);
    const settings = createGuildSettings(store);
    expect(settings.musicChannel("9")).toBeNull();
    await settings.load("9");
    expect(settings.musicChannel("9")).toBe("55");
    await settings.setMusicChannel("9", null);
    expect(settings.musicChannel("9")).toBeNull();
    settings.apply({ guildId: "9", guildName: "C", ownerId: "1", musicChannelId: "66", avatar: DEFAULT_OUTFIT });
    expect(settings.musicChannel("9")).toBe("66");
  });
});

describe("command audit and Dashboard promo (#106, spec #13, #34)", () => {
  test("the audit embed has v5's lines", () => {
    const notice = auditNotice({
      user: { id: "1", tag: "dee", avatarUrl: "https://a" },
      voice: null,
      command: { name: "play", id: "c1" },
      channel: { name: "music", id: "5" },
      guild: { name: "Club", id: "9", iconUrl: null },
    });
    expect(notice.author).toEqual({ name: "View User", iconUrl: "https://a", url: "https://discord.com/users/1" });
    expect(notice.description).toBe(
      "User: `dee`(`1`)\nUserChannel: `Not in voice`(`N/A`)\nCommand: `play`(`c1`)\nChannel: `music`(`5`)\nServer: `Club`(`9`)",
    );
  });

  test("the promo follows v5's music commands 30 % of the time, never other commands", () => {
    expect(PROMO_COMMANDS).toEqual([
      "play",
      "skip",
      "pause",
      "volume",
      "loop",
      "clear",
      "seek",
      "247",
      "queue",
      "leave",
    ]);
    expect(shouldPromo("play", () => 0.29)).toBe(true);
    expect(shouldPromo("play", () => 0.3)).toBe(false);
    expect(shouldPromo("ping", () => 0)).toBe(false);
    expect(promoNotice("https://dash.test/").description).toBe(
      "-# สามารถควบคุมจาก [Dashboard](https://dash.test/) ได้แล้ว ง่ายกว่าใช้คำสั่งเยอะ ลองใช้เลย! \n - https://dash.test/",
    );
  });
});

describe("/setchannel (#106, spec #12)", () => {
  test("sets or clears the Music Channel with v5's replies", async () => {
    const { commands } = await import("../src/commands");
    const command = commands.find((c) => c.data.name === "setchannel");
    if (!command) throw new Error("no /setchannel");
    const set = mock(async () => {});
    const ctx = (channel: string | null) =>
      ({
        guildId: "9",
        channelId: "1",
        user: { id: "2", name: "Dee", avatarUrl: null },
        memberVoiceChannelId: null,
        canSpeakIn: () => true,
        option: (name: string) => (name === "channel" ? channel : null),
        latencyMs: { reply: 1, ws: 1 },
        setMusicChannel: set,
      }) as never;
    const done = await command.run(ctx("55"), {} as never);
    expect(set).toHaveBeenCalledWith("55");
    expect(done).toMatchObject({ ephemeral: true, notice: { title: "⚙️ | ตั้งค่า Music Channel", footer: "ตั้งค่าโดย Dee" } });
    expect(done.notice.description).toBe(
      "✅ ตั้งค่า Music Channel เป็น <#55> สำเร็จ!\n\nบอทจะส่งข้อความเกี่ยวกับเพลงใน channel นี้",
    );
    const cleared = await command.run(ctx(null), {} as never);
    expect(set).toHaveBeenLastCalledWith(null);
    expect(cleared.notice.description).toBe("✅ ลบการตั้งค่า Music Channel แล้ว\n\nบอทจะส่งข้อความใน channel ที่สั่งเพลง");
  });
});

describe("/setchannel refusals (#106 review)", () => {
  const ctxWith = (result: "ok" | "forbidden" | "cannot-post" | "failed") =>
    ({
      guildId: "9",
      channelId: "1",
      user: { id: "2", name: "Dee", avatarUrl: null },
      memberVoiceChannelId: null,
      canSpeakIn: () => true,
      option: () => "55",
      latencyMs: { reply: 1, ws: 1 },
      setMusicChannel: async () => result,
    }) as never;
  test("only the Server Owner or Bot Owner; only a channel the Bot can post in; v5's error otherwise", async () => {
    const { commands } = await import("../src/commands");
    const command = commands.find((c) => c.data.name === "setchannel");
    if (!command) throw new Error("no /setchannel");
    const text = async (r: "ok" | "forbidden" | "cannot-post" | "failed") =>
      (await command.run(ctxWith(r), {} as never)).notice.description;
    expect(await text("forbidden")).toBe("> `❌` เฉพาะเจ้าของเซิร์ฟเวอร์หรือ Bot Owner ที่เปลี่ยนการตั้งค่าได้");
    expect(await text("cannot-post")).toBe("> `❌` บอทส่งข้อความในห้อง <#55> ไม่ได้");
    expect(await text("failed")).toBe("> `❌` เกิดข้อผิดพลาดในการตั้งค่า กรุณาลองใหม่อีกครั้ง");
  });
});

describe("audit names cannot break the code spans (#106 review)", () => {
  test("backticks in names are replaced", () => {
    const notice = auditNotice({
      user: { id: "1", tag: "a`b", avatarUrl: null },
      voice: null,
      command: { name: "play", id: "c" },
      channel: { name: "x`y", id: "5" },
      guild: { name: "`Club`", id: "9", iconUrl: null },
    });
    expect(notice.description).not.toMatch(/a`b|x`y|``Club/);
  });
});
