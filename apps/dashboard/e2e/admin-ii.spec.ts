import { setFakeDiscordUser } from "@narze/fake-discord";
import { localSupabase } from "@narze/fake-discord/supabase-local";
import {
  type AdminGuild,
  AdminQuerySchema,
  Channels,
  DEFAULT_REDIS_URL,
  type MessagePage,
  parseJson,
  trackKey,
} from "@narze/shared";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import Redis from "ioredis";
import { signInThroughPopup } from "./support";

const dev = { id: "490000000000000410", username: "devdash110", globalName: "Devi" };
const lumi = { id: "490000000000000420", name: "Lumi", avatarUrl: null };
const G = "491000000000000001";
const OTHER = "491000000000000002";
const CHANNEL = "492000000000000001";
const redis = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);
const bot = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);
const listener = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);
const supabase = localSupabase();
const db = createClient(supabase.url, supabase.secretKey, { auth: { persistSession: false } });

const guilds: AdminGuild[] = [
  { id: G, name: "Admin Club", iconUrl: null, memberCount: 42, joinedAt: 1_700_000_000_000, ownerId: dev.id },
  { id: OTHER, name: "Quiet Room", iconUrl: null, memberCount: 5, joinedAt: 1_690_000_000_000, ownerId: dev.id },
];
const message = (id: string, at: number, extra: Partial<MessagePage["messages"][number]>) => ({
  id,
  content: "",
  author: { id: lumi.id, name: "Lumi", avatarUrl: null, bot: false },
  at,
  editedAt: null,
  mentions: [],
  mentionedRoles: [],
  attachments: [],
  embeds: [],
  reactions: [],
  replyTo: null,
  thread: null,
  ...extra,
});
const PIXEL = "http://127.0.0.1:4611/pixel.png";
const page: MessagePage = {
  channel: { id: CHANNEL, name: "general" },
  messages: [
    message("493000000000000001", 1_700_000_000_000, { content: "first one" }),
    message("493000000000000002", 1_700_000_060_000, {
      content: "**bold move** <@490000000000000430> <@&494000000000000001> `code`",
      mentions: [{ id: "490000000000000430", name: "Kai" }],
      mentionedRoles: [{ id: "494000000000000001", name: "DJ", color: "#e91e63" }],
      attachments: [
        {
          id: "a1",
          name: "cat.png",
          url: PIXEL,
          size: 68,
          contentType: "image/png",
          fileType: "image",
          width: 1,
          height: 1,
          spoiler: false,
        },
        {
          id: "a2",
          name: "notes.zip",
          url: "http://127.0.0.1:4611/notes.zip",
          size: 2048,
          contentType: null,
          fileType: "file",
          width: null,
          height: null,
          spoiler: false,
        },
      ],
      embeds: [
        {
          type: "rich",
          title: "Now playing",
          description: "Idol by YOASOBI",
          url: null,
          color: "#5865f2",
          provider: null,
          author: null,
          thumbnail: null,
          image: null,
          video: null,
        },
      ],
      reactions: [{ emoji: "🔥", count: 3 }],
      replyTo: { messageId: "493000000000000001", authorName: "Lumi", content: "first one" },
      thread: {
        id: "495000000000000001",
        name: "after-party",
        messageCount: 4,
        lastActivityAt: 1_700_000_100_000,
        archived: false,
      },
    }),
    message("493000000000000003", 1_700_000_120_000, {
      content: "every kind",
      attachments: [
        {
          id: "k1",
          name: "clip.mp4",
          url: "http://127.0.0.1:4611/clip.mp4",
          size: 10,
          contentType: "video/mp4",
          fileType: "video",
          width: null,
          height: null,
          spoiler: false,
        },
        {
          id: "k2",
          name: "voice.ogg",
          url: "http://127.0.0.1:4611/voice.ogg",
          size: 10,
          contentType: "audio/ogg",
          fileType: "audio",
          width: null,
          height: null,
          spoiler: false,
        },
        {
          id: "k3",
          name: "spec.pdf",
          url: "http://127.0.0.1:4611/spec.pdf",
          size: 10,
          contentType: "application/pdf",
          fileType: "document",
          width: null,
          height: null,
          spoiler: false,
        },
        {
          id: "k4",
          name: "SPOILER_plot.png",
          url: PIXEL,
          size: 10,
          contentType: "image/png",
          fileType: "image",
          width: 1,
          height: 1,
          spoiler: true,
        },
      ],
      embeds: [
        {
          type: "video",
          title: "MV",
          description: null,
          url: "https://www.youtube.com/watch?v=abc",
          color: null,
          provider: { name: "YouTube", url: "https://www.youtube.com" },
          author: null,
          thumbnail: PIXEL,
          image: null,
          video: "https://www.youtube.com/embed/abc",
        },
        {
          type: "gifv",
          title: null,
          description: null,
          url: "https://tenor.com/x",
          color: null,
          provider: null,
          author: null,
          thumbnail: null,
          image: null,
          video: "http://127.0.0.1:4611/x.mp4",
        },
        {
          type: "image",
          title: null,
          description: null,
          url: PIXEL,
          color: null,
          provider: null,
          author: null,
          thumbnail: PIXEL,
          image: null,
          video: null,
        },
      ],
    }),
  ],
};

test.beforeAll(async () => {
  listener.on("message", async (_channel, raw) => {
    const query = parseJson(AdminQuerySchema, raw);
    if (!query) return;
    const data =
      query.kind === "guilds"
        ? guilds
        : query.kind === "guild"
          ? guilds.find((g) => g.id === query.guildId)
          : query.kind === "channels"
            ? [{ id: CHANNEL, name: "general", kind: "text", parentId: null, parentName: null, position: 0 }]
            : query.kind === "messages"
              ? page
              : null;
    const result =
      data === undefined ? { id: query.id, ok: false, error: "not-found" } : { id: query.id, ok: true, data };
    await bot.publish(Channels.botAdminResults, JSON.stringify(result));
  });
  await listener.subscribe(Channels.botAdminQueries);
  await db.from("play_history").delete().eq("discord_id", lumi.id);
  await db.from("listening_sessions").delete().eq("guild_id", G);
  // Lumi's name comes from the session they were in: they never opened the Dashboard.
  await db.from("listening_sessions").insert({
    id: `${G}-e2e`,
    guild_id: G,
    guild_name: "Admin Club",
    channel_id: null,
    start_time: 1_700_000_000_000,
    end_time: 1_700_000_600_000,
    is_active: false,
    tracks: [],
    participants: [{ ...lumi, joinedAt: 1_700_000_000_000 }],
    participant_ids: [lumi.id],
    track_count: 0,
  });
  const play = (title: string) => ({
    trackId: trackKey(title, "YOASOBI"),
    title,
    artist: "YOASOBI",
    uri: `https://x.test/${title}`,
    thumbnail: null,
    durationMs: 1000,
    source: "youtube",
    isMusic: true,
    isVideo: false,
  });
  for (const title of ["Idol", "Idol", "Yoru"])
    await db.rpc("record_play", { p_guild: G, p_user: lumi.id, p_track: play(title) });
});

test.afterAll(async () => {
  await db.from("listening_sessions").delete().eq("guild_id", G);
  await db.from("play_history").delete().eq("discord_id", lumi.id);
  await db.from("play_history").delete().eq("guild_id", G);
  await listener.quit();
  await bot.quit();
  await redis.quit();
});

test("an admin opens a guild, reads a channel, and views a user (#111, AC5)", async ({ page: tab }) => {
  await setFakeDiscordUser(dev, []);
  await signInThroughPopup(tab, "Devi");
  await tab.goto("/admin/guilds");
  await expect(tab.getByRole("heading", { name: "เซิร์ฟเวอร์ทั้งหมด", level: 1 })).toBeVisible();
  const rows = tab.getByTestId("admin-guild");
  await expect(rows).toHaveCount(2);
  // Totals: servers and members.
  await expect(tab.getByTestId("admin-totals")).toContainText("47");
  await tab.getByRole("searchbox", { name: "ค้นหาเซิร์ฟเวอร์" }).fill("quiet");
  await expect(rows).toHaveText([/Quiet Room/]);
  await tab.getByRole("searchbox", { name: "ค้นหาเซิร์ฟเวอร์" }).fill("");
  await rows.filter({ hasText: "Admin Club" }).getByRole("link", { name: "Admin Club" }).click();

  await expect(tab.getByRole("heading", { name: "Admin Club", level: 1 })).toBeVisible();
  // AC4: Thai dates (Buddhist year) for when the Bot joined.
  await expect(tab.getByTestId("guild-joined")).toContainText("2566");
  await tab.getByRole("tab", { name: "ช่อง" }).click();
  await tab.getByRole("link", { name: "general" }).click();
  await expect(tab).toHaveURL(new RegExp(`tab=channels&channel=${CHANNEL}`));
  const messages = tab.getByTestId("discord-message");
  await expect(messages).toHaveCount(3);
  const rich = messages.nth(1);
  await expect(rich.getByTestId("message-text").locator("strong")).toHaveText("bold move");
  await expect(rich.getByText("@Kai")).toBeVisible();
  await expect(rich.getByText("@DJ")).toBeVisible();
  await expect(rich.getByTestId("reply-preview")).toContainText("first one");
  await expect(rich.getByText("Now playing")).toBeVisible();
  await expect(rich.getByTestId("reaction")).toHaveText(/🔥\s*3/);
  await expect(rich.getByRole("link", { name: /notes\.zip/ })).toHaveAttribute("download", "");
  await expect(rich.getByTestId("thread-preview")).toContainText("after-party");
  await rich.getByRole("button", { name: "ดูรูป cat.png" }).click();
  const lightbox = tab.getByRole("dialog", { name: "cat.png" });
  await expect(lightbox).toBeVisible();
  await tab.keyboard.press("Escape");
  await expect(lightbox).toBeHidden();
  // AC1: every attachment and embed kind is drawn.
  const kinds = messages.nth(2);
  await expect(kinds.getByLabel("clip.mp4")).toHaveJSProperty("tagName", "VIDEO");
  await expect(kinds.getByLabel("voice.ogg")).toHaveJSProperty("tagName", "AUDIO");
  await expect(kinds.getByRole("link", { name: /spec\.pdf/ })).toHaveAttribute("download", "");
  await kinds.getByRole("button", { name: /สปอยเลอร์/ }).click();
  await expect(kinds.getByRole("button", { name: "ดูรูป SPOILER_plot.png" })).toBeVisible();
  await expect(kinds.locator("iframe")).toHaveAttribute("src", "https://www.youtube.com/embed/abc");
  await expect(kinds.getByLabel("GIF")).toHaveJSProperty("tagName", "VIDEO");
  await expect(kinds.locator('img[src$="pixel.png"]')).not.toHaveCount(0);
  // A reload keeps the tab and the channel (URL state).
  await tab.reload();
  await expect(tab.getByTestId("discord-message")).toHaveCount(3);

  await tab.goto("/admin/users");
  const user = tab.getByTestId("admin-user").filter({ hasText: "Lumi" });
  await expect(user).toContainText("3");
  await user.getByRole("link", { name: "Lumi" }).click();
  await expect(tab.getByRole("heading", { name: "Lumi", level: 1 })).toBeVisible();
  await expect(tab.getByTestId("user-history")).toContainText("Idol");
  await expect(tab.getByTestId("user-history")).toContainText("Yoru");
});
