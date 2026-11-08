import { describe, expect, test } from "bun:test";
import { DiscordMessageSchema, RESTART_EXIT_CODE, SHUTDOWN_EXIT_CODE } from "@narze/shared";
import { answerAdminQuery, type MessageLike, toMessages } from "../src/admin/queries";

const list = <T>(...items: T[]) => ({ values: () => items.values() });
const user = (id: string, username: string) => ({
  id,
  username,
  globalName: null,
  bot: false,
  displayAvatarURL: () => `https://cdn.discordapp.com/avatars/${id}/a.png`,
});
const attachment = (id: string, name: string, contentType: string | null) => ({
  id,
  name,
  url: `https://cdn.discordapp.com/attachments/1/${id}/${name}`,
  size: 100,
  contentType,
  width: contentType?.startsWith("image") ? 64 : null,
  height: contentType?.startsWith("image") ? 48 : null,
  spoiler: name.startsWith("SPOILER_"),
});
const embed = (type: string, extra: Record<string, unknown> = {}) => ({
  data: { type },
  title: null,
  description: null,
  url: null,
  hexColor: null,
  provider: null,
  author: null,
  thumbnail: null,
  image: null,
  video: null,
  ...extra,
});
const message = (id: string, at: number, extra: Partial<MessageLike> = {}): MessageLike => ({
  id,
  content: "",
  createdTimestamp: at,
  editedTimestamp: null,
  author: user("200000000000000002", "dee"),
  member: { displayName: "Dee" },
  mentions: { users: list(), roles: list() },
  attachments: list(),
  embeds: [],
  reactions: { cache: list() },
  reference: null,
  thread: null,
  ...extra,
});

describe("Discord messages for the channel viewer (#111, spec #111)", () => {
  test("every attachment kind and every embed kind comes through, oldest first", () => {
    const fixtures = [
      message("12", 2_000, {
        content: "files",
        attachments: list(
          attachment("a1", "cat.png", "image/png"),
          attachment("a2", "clip.mp4", "video/mp4"),
          attachment("a3", "voice.ogg", "audio/ogg"),
          attachment("a4", "spec.pdf", "application/pdf"),
          attachment("a5", "data.zip", null),
          attachment("a6", "SPOILER_secret.jpg", "image/jpeg"),
        ),
      }),
      message("11", 1_000, {
        content: "embeds",
        embeds: [
          embed("rich", {
            title: "Now playing",
            description: "by <@200000000000000001>",
            url: "https://example.com/x",
            hexColor: "#5865f2",
            author: { name: "Narze", iconURL: "https://example.com/i.png" },
            thumbnail: { url: "https://example.com/t.png" },
          }),
          embed("video", {
            url: "https://www.youtube.com/watch?v=abc",
            provider: { name: "YouTube", url: "https://www.youtube.com" },
            video: { url: "https://www.youtube.com/embed/abc" },
            thumbnail: { url: "https://i.ytimg.com/vi/abc/hq.jpg" },
          }),
          embed("gifv", { url: "https://tenor.com/x", video: { url: "https://media.tenor.com/x.mp4" } }),
          embed("image", { url: "https://example.com/p.png", thumbnail: { url: "https://example.com/p.png" } }),
        ],
      }),
    ];
    const out = toMessages(fixtures);
    for (const m of out) DiscordMessageSchema.parse(m);
    expect(out.map((m) => m.id)).toEqual(["11", "12"]);
    expect(out[1]?.attachments.map((a) => [a.fileType, a.spoiler])).toEqual([
      ["image", false],
      ["video", false],
      ["audio", false],
      ["document", false],
      ["file", false],
      ["image", true],
    ]);
    expect(out[0]?.embeds.map((e) => e.type)).toEqual(["rich", "video", "gifv", "image"]);
    expect(out[0]?.embeds[1]?.video).toBe("https://www.youtube.com/embed/abc");
    expect(out[0]?.embeds[0]?.author).toEqual({ name: "Narze", iconUrl: "https://example.com/i.png" });
    // A link preview's picture comes through Discord's proxy, not the poster's host.
    const proxied = toMessages([
      message("13", 3_000, {
        embeds: [
          embed("article", {
            thumbnail: { url: "https://evil.example/pixel.png", proxyURL: "https://images-ext-1.discordapp.net/x.png" },
          }),
        ],
      }),
    ]);
    expect(proxied[0]?.embeds[0]?.thumbnail).toBe("https://images-ext-1.discordapp.net/x.png");
  });

  test("mentions, role colours, reactions, a reply within the page, and a thread preview", () => {
    const out = toMessages([
      message("21", 1_000, { content: "first message" }),
      message("22", 2_000, {
        content: "<@200000000000000001> <@&300000000000000001> look",
        author: user("200000000000000001", "kai"),
        member: null,
        mentions: {
          users: list(user("200000000000000001", "kai")),
          roles: list({ id: "300000000000000001", name: "DJ", hexColor: "#e91e63", color: 0xe91e63 }),
        },
        reactions: {
          cache: list({ emoji: { name: "🔥", id: null }, count: 3 }, { emoji: { name: "party", id: "77" }, count: 1 }),
        },
        reference: { messageId: "21" },
        thread: {
          id: "90",
          name: "follow-up",
          messageCount: 4,
          archived: false,
          archiveTimestamp: null,
          createdTimestamp: 3_000,
        },
      }),
      message("23", 3_000, { reference: { messageId: "5" } }),
    ]);
    const reply = out[1];
    expect(reply?.author).toEqual({ id: "200000000000000001", name: "kai", avatarUrl: expect.any(String), bot: false });
    expect(reply?.mentions).toEqual([{ id: "200000000000000001", name: "kai" }]);
    expect(reply?.mentionedRoles).toEqual([{ id: "300000000000000001", name: "DJ", color: "#e91e63" }]);
    expect(reply?.reactions).toEqual([
      { emoji: "🔥", count: 3 },
      { emoji: "party", count: 1 },
    ]);
    expect(reply?.replyTo).toEqual({ messageId: "21", authorName: "Dee", content: "first message" });
    expect(reply?.thread).toEqual({
      id: "90",
      name: "follow-up",
      messageCount: 4,
      lastActivityAt: 3_000,
      archived: false,
    });
    // A reply to a message outside the page still says it is a reply.
    expect(out[2]?.replyTo).toEqual({ messageId: "5", authorName: null, content: "" });
  });
});

describe("restart and shutdown (#111)", () => {
  test("the Bot answers first, then exits with the code for what was asked", async () => {
    const exits: number[] = [];
    const answers: unknown[] = [];
    const deps = { client: null as never, exit: (code: number) => void exits.push(code) };
    answers.push(await answerAdminQuery({ id: "r", kind: "restart", by: "200000000000000002" }, deps));
    answers.push(await answerAdminQuery({ id: "s", kind: "shutdown", by: "200000000000000002" }, deps));
    expect(answers).toEqual([
      { id: "r", ok: true, data: null },
      { id: "s", ok: true, data: null },
    ]);
    await Bun.sleep(10);
    expect(exits).toEqual([RESTART_EXIT_CODE, SHUTDOWN_EXIT_CODE]);
  });
});

describe("the admin query bus over Redis (#111, scrutinize M2)", () => {
  test("answers on bot:admin-results in the shared shapes; a Bot still logging in says not-ready", async () => {
    const { AdminGuildSchema, AdminQueryResultSchema, Channels, DEFAULT_REDIS_URL } = await import("@narze/shared");
    const { default: Redis } = await import("ioredis");
    const { startAdminQueries } = await import("../src/admin/queries");
    const url = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
    const [redis, subscriber, asker, listener] = [new Redis(url), new Redis(url), new Redis(url), new Redis(url)];
    let ready = false;
    const guild = {
      id: "600000000000000001",
      name: "Bus Club",
      iconURL: () => null,
      memberCount: 9,
      joinedTimestamp: 1_700_000_000_000,
      ownerId: "600000000000000002",
      channels: { cache: new Map(), fetch: async () => null },
    };
    const client = { isReady: () => ready, guilds: { cache: new Map([[guild.id, guild]]) } } as never;
    await startAdminQueries({ subscriber, redis, client, exit: () => {} });
    await listener.subscribe(Channels.botAdminResults);
    const ask = (id: string) =>
      new Promise<unknown>((resolve) => {
        listener.on("message", (_c, raw) => {
          const result = AdminQueryResultSchema.parse(JSON.parse(raw));
          if (result.id === id) resolve(result);
        });
        void asker.publish(Channels.botAdminQueries, JSON.stringify({ id, kind: "guilds" }));
      });
    expect(await ask("bus-1")).toEqual({ id: "bus-1", ok: false, error: "not-ready" });
    ready = true;
    const answered = (await ask("bus-2")) as { ok: true; data: unknown };
    expect(AdminGuildSchema.array().parse(answered.data)).toEqual([
      {
        id: guild.id,
        name: "Bus Club",
        iconUrl: null,
        memberCount: 9,
        joinedAt: 1_700_000_000_000,
        ownerId: guild.ownerId,
      },
    ]);
    for (const c of [redis, subscriber, asker, listener]) await c.quit();
  });
});

describe("the supervisor (#111, scrutinize M1)", () => {
  test("starts the Bot again only after a Dashboard restart; any other exit stays down", async () => {
    const { afterExit } = await import("../src/supervise");
    expect(afterExit(RESTART_EXIT_CODE)).toBe("restart");
    expect(afterExit(SHUTDOWN_EXIT_CODE)).toBe("stop");
    expect(afterExit(1)).toBe("stop");
    expect(afterExit(null)).toBe("stop");
  });
});
