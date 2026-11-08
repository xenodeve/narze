import AxeBuilder from "@axe-core/playwright";
import { setFakeDiscordUser } from "@narze/fake-discord";
import { localSupabase } from "@narze/fake-discord/supabase-local";
import {
  type AdminQuery,
  AdminQuerySchema,
  Channels,
  DEFAULT_REDIS_URL,
  GuildEventTypes,
  type MessagePage,
  PlayerCommandSchema,
  type PlayerState,
  parseJson,
  RedisKeys,
  trackKey,
} from "@narze/shared";
import { expect, type Page, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import Redis from "ioredis";
import { signInThroughPopup } from "./support";

/**
 * #114 hardening: every route has no axe violation (WCAG 2.x A/AA) and no route scrolls sideways at
 * 390 / 1024 / 1440 px in light and dark — with real content on screen: a Player with a queue, an
 * idle guild with a chart, a Listening Session, Play History, a playlist, a like, and the admin pages
 * answered by a fake Bot. Signed in as the Developer from NARZE_DEVELOPER_IDS.
 */
const dev = { id: "490000000000000410", username: "devdash110", globalName: "Devi" };
const G = "934000000000000001";
const G_IDLE = "934000000000000002";
const SESSION = `${G}-a11y`;
const CHANNEL = "936000000000000001";
const redis = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);
const botSide = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);
const botListener = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);
const supabase = localSupabase();
const db = createClient(supabase.url, supabase.secretKey, { auth: { persistSession: false } });
let playlistId = "";

const track = (title: string) => ({
  uri: `https://music.youtube.com/watch?v=${title}`,
  source: "youtubemusic" as const,
  title,
  author: "Kenshi Yonezu",
  durationMs: 200_000,
  artworkUrl: null,
  requester: { id: dev.id, name: "Devi", avatarUrl: null },
});
const playing = (): PlayerState => ({
  guildId: G,
  current: track("Lemon"),
  positionMs: 1000,
  syncedAt: Date.now(),
  paused: false,
  volume: 15,
  loop: "off",
  twentyFourSeven: false,
  queue: [track("Idol"), track("Yoru")],
  revision: 9000,
  epoch: "a11y-e2e",
  lastSeekAt: null,
  voiceChannelId: "94",
});

/** The Bot's side of the contract: the key, then the event the Backend's hot cache follows (ADR-0006). */
async function botPublishes(state: PlayerState): Promise<void> {
  await redis.set(RedisKeys.playerState(state.guildId), JSON.stringify(state));
  await redis.set(
    RedisKeys.playerSummary(state.guildId),
    JSON.stringify({ playing: !state.paused, queueLength: state.queue.length, voiceChannelId: state.voiceChannelId }),
  );
  await redis.publish(
    Channels.guildEvents,
    JSON.stringify({
      type: GuildEventTypes.playerState,
      guildId: state.guildId,
      revision: state.revision,
      sequence: state.revision,
      ts: Date.now(),
      data: state,
    }),
  );
}

const messages: MessagePage = {
  channel: { id: CHANNEL, name: "general" },
  messages: [
    {
      id: "937000000000000001",
      content: "**hello** <@490000000000000410> `code`",
      author: { id: dev.id, name: "Devi", avatarUrl: null, bot: false },
      at: 1_700_000_000_000,
      editedAt: null,
      mentions: [{ id: dev.id, name: "Devi" }],
      mentionedRoles: [],
      attachments: [],
      embeds: [
        {
          type: "rich",
          title: "Now playing",
          description: "Lemon",
          url: null,
          color: "#5865f2",
          provider: null,
          author: null,
          thumbnail: null,
          image: null,
          video: null,
        },
      ],
      reactions: [{ emoji: "🔥", count: 2 }],
      replyTo: null,
      thread: null,
    },
  ],
};
function answer(query: AdminQuery): unknown {
  const guild = {
    id: G,
    name: "A11y Room",
    iconUrl: null,
    memberCount: 9,
    joinedAt: 1_700_000_000_000,
    ownerId: dev.id,
  };
  switch (query.kind) {
    case "guilds":
      return [guild];
    case "guild":
      return guild;
    case "channels":
      return [{ id: CHANNEL, name: "general", kind: "text", parentId: null, parentName: null, position: 0 }];
    case "messages":
      return messages;
    default:
      return null;
  }
}

/** Each route with the content that proves it rendered (not a loading placeholder or a refusal). */
const ROUTES: Array<[string, (page: Page) => ReturnType<Page["locator"]>]> = [
  ["/", (p) => p.getByRole("heading", { level: 1 }).first()],
  ["/search", (p) => p.getByRole("searchbox").first()],
  ["/library", (p) => p.getByText("A11y list")],
  ["/library/liked", (p) => p.getByText("Gurenge", { exact: true })],
  ["/sessions", (p) => p.getByTestId("session-card").first()],
  [`/sessions/${SESSION}`, (p) => p.getByTestId("session-track").first()],
  ["/artist/a1", (p) => p.getByRole("heading", { name: "YOASOBI" })],
  ["/album/al2", (p) => p.getByRole("heading", { name: "THE BOOK" })],
  [`/guilds/${G}`, (p) => p.getByTestId("queue-row").first()],
  [`/guilds/${G_IDLE}`, (p) => p.getByRole("tablist", { name: "ประเทศ" })],
  [`/guilds/${G}/settings`, (p) => p.getByRole("heading", { name: "ตั้งค่าเซิร์ฟเวอร์" })],
  ["/admin", (p) => p.getByRole("heading", { name: "ภาพรวมบอท" })],
  ["/admin/logs", (p) => p.getByRole("heading", { name: "Log สดของบอท" })],
  ["/admin/settings", (p) => p.getByTestId("whitelist-row").first()],
  ["/admin/guilds", (p) => p.getByTestId("admin-guild").first()],
  [`/admin/guilds/${G}?tab=channels&channel=${CHANNEL}`, (p) => p.getByTestId("discord-message").first()],
  ["/admin/users", (p) => p.getByTestId("admin-user").first()],
  [`/admin/users/${dev.id}`, (p) => p.getByTestId("user-history")],
  [`/admin/sessions/${SESSION}`, (p) => p.getByRole("table")],
];
const libraryRoute = () => `/library/${playlistId}`;

test.beforeAll(async () => {
  await redis.sadd(RedisKeys.botGuilds, G, G_IDLE);
  await redis.del(RedisKeys.playerState(G_IDLE), RedisKeys.playerSummary(G_IDLE));
  await botPublishes(playing());
  botListener.on("message", async (_channel, raw) => {
    const query = parseJson(AdminQuerySchema, raw);
    if (!query) return;
    await botSide.publish(Channels.botAdminResults, JSON.stringify({ id: query.id, ok: true, data: answer(query) }));
  });
  await botListener.subscribe(Channels.botAdminQueries);
  // The settings page needs the row the Bot writes when it joins a server (#106).
  await db.from("guild_settings").upsert({ guild_id: G, guild_name: "A11y Room", owner_id: dev.id });
  await db.from("listening_sessions").delete().eq("id", SESSION);
  const lemon = { ...track("Lemon"), author: "Kenshi Yonezu", thumbnail: null, playedAt: 1_700_000_000_000 };
  await db.from("listening_sessions").insert({
    id: SESSION,
    guild_id: G,
    guild_name: "A11y Room",
    channel_id: "94",
    start_time: 1_700_000_000_000,
    end_time: 1_700_000_600_000,
    is_active: false,
    tracks: [
      {
        title: lemon.title,
        author: lemon.author,
        uri: lemon.uri,
        thumbnail: null,
        durationMs: 200_000,
        playedAt: lemon.playedAt,
        requester: lemon.requester,
      },
    ],
    participants: [{ ...lemon.requester, joinedAt: 1_700_000_000_000 }],
    participant_ids: [dev.id],
    track_count: 1,
  });
  await db.rpc("record_play", {
    p_guild: G,
    p_user: dev.id,
    p_track: {
      trackId: trackKey("Lemon", "Kenshi Yonezu"),
      title: "Lemon",
      artist: "Kenshi Yonezu",
      uri: lemon.uri,
      thumbnail: null,
      durationMs: 200_000,
      source: "youtube",
      isMusic: true,
      isVideo: false,
    },
  });
});
test.afterAll(async () => {
  await redis.srem(RedisKeys.botGuilds, G, G_IDLE);
  await redis.del(RedisKeys.playerState(G), RedisKeys.playerSummary(G));
  await db.from("guild_settings").delete().eq("guild_id", G);
  await db.from("listening_sessions").delete().eq("id", SESSION);
  if (playlistId) await db.from("playlists").delete().eq("id", playlistId);
  await db.from("likes").delete().eq("discord_id", dev.id).eq("uri", "https://x.test/gurenge");
  await botListener.quit();
  await botSide.quit();
  await redis.quit();
});

async function signedIn(page: Page): Promise<void> {
  await setFakeDiscordUser(dev, [
    { id: G, name: "A11y Room", icon: null, owner: true },
    { id: G_IDLE, name: "Quiet Room", icon: null, owner: true },
  ]);
  await signInThroughPopup(page, "Devi");
  // The library rows need the user row the sign-in just wrote.
  if (!playlistId) {
    await db.from("playlists").delete().eq("owner_id", dev.id).eq("name", "A11y list");
    const { data } = await db.from("playlists").insert({ owner_id: dev.id, name: "A11y list" }).select("id").single();
    playlistId = (data as { id: string }).id;
    await db.from("playlist_tracks").insert([
      {
        playlist_id: playlistId,
        position: 0,
        title: "Idol",
        artist: "YOASOBI",
        duration_ms: 213_000,
        uri: "https://x.test/idol",
      },
    ]);
    await db.from("likes").upsert({
      discord_id: dev.id,
      uri: "https://x.test/gurenge",
      title: "Gurenge",
      artist: "LiSA",
      duration_ms: 239_000,
    });
  }
}

/** Opens a route and waits for its own content: a loading placeholder or a refusal fails here. */
async function open(page: Page, route: string, content: (page: Page) => ReturnType<Page["locator"]>): Promise<void> {
  await page.goto(route);
  await expect(content(page)).toBeVisible({ timeout: 10_000 });
  await page.waitForLoadState("networkidle");
}

const allRoutes = (): Array<[string, (page: Page) => ReturnType<Page["locator"]>]> => [
  ...ROUTES,
  [libraryRoute(), (p) => p.getByText("Idol").first()],
];

async function axeOn(page: Page, route: string): Promise<string[]> {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    // Supplied canvases draw no text; their containers are aria-hidden.
    .exclude("canvas")
    .analyze();
  return result.violations.map(
    (v) =>
      `${route} ${v.id} (${v.impact}): ${v.nodes
        .map((n) => n.target.join(" "))
        .slice(0, 3)
        .join(" | ")}`,
  );
}

for (const scheme of ["light", "dark"] as const) {
  test(`axe finds no violations on any route, with content (${scheme}) (#114 AC2)`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ colorScheme: scheme });
    await signedIn(page);
    const found: string[] = [];
    for (const [route, content] of allRoutes()) {
      await open(page, route, content);
      found.push(...(await axeOn(page, route)));
    }
    expect(found).toEqual([]);
  });
}

test("axe finds no violations on the signed-out landing page (#114 AC2)", async ({ page }) => {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await open(page, "/", (p) => p.getByRole("button", { name: "เข้าสู่ระบบด้วย Discord" }));
    expect(await axeOn(page, `/ signed out (${scheme})`)).toEqual([]);
  }
});

test("no route scrolls sideways at 390, 1024 or 1440 px, light or dark (#114)", async ({ page }) => {
  test.setTimeout(480_000);
  await signedIn(page);
  const wide: string[] = [];
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of [390, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [route, content] of allRoutes()) {
        await open(page, route, content);
        const over = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (over > 0) wide.push(`${route} @${width} ${scheme}: +${over}px`);
      }
    }
  }
  expect(wide).toEqual([]);
});

for (const [name, setup, query] of [
  ["reduced motion", async (page: Page) => page.emulateMedia({ reducedMotion: "reduce" }), ""],
  ["?fx=0", async () => {}, "?fx=0"],
  [
    "no WebGL",
    async (page: Page) =>
      page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
          if (type === "webgl2" || type === "webgl") return null;
          return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
        } as typeof original;
      }),
    "",
  ],
] as const) {
  test(`${name}: the player page renders fully with the flat wash, no errors (#114)`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await setup(page);
    await signedIn(page);
    await open(page, `/guilds/${G}${query}`, (p) => p.getByTestId("queue-row").first());
    await expect(page.locator('[data-fx="wash"]')).toHaveCount(1);
    await expect(page.locator('[data-fx="aurora"]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("keyboard only: Tab reaches playback and queue controls, they show focus, and Enter/Space act (#114)", async ({
  page,
}) => {
  const bot = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);
  const heard: string[] = [];
  await bot.subscribe(Channels.botCommands);
  bot.on("message", (_c, raw) => {
    const cmd = PlayerCommandSchema.parse(JSON.parse(raw));
    heard.push(cmd.command.action);
    void redis.publish(Channels.botCommandResults, JSON.stringify({ id: cmd.id, ok: true }));
  });
  await botPublishes(playing());
  await signedIn(page);
  await page.goto(`/guilds/${G}`);
  // The controls unlock once Control Permission has loaded; a disabled button takes no focus.
  await expect(page.getByTestId("toggle-pause")).toBeEnabled();

  /** Tabs forward until `target` has focus (at most 80 stops), then checks a focus ring is drawn. */
  const tabTo = async (target: ReturnType<Page["locator"]>) => {
    for (let i = 0; i < 80; i++) {
      if (await target.evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press("Tab");
    }
    await expect(target).toBeFocused();
    const ring = await target.evaluate((el) => {
      const style = getComputedStyle(el);
      return style.outlineStyle !== "none" || style.boxShadow !== "none";
    });
    expect(ring).toBe(true);
  };
  await tabTo(page.getByTestId("toggle-pause"));
  await page.keyboard.press("Space");
  await expect.poll(() => heard).toContain("pause");
  await tabTo(page.getByRole("button", { name: "เล่น Idol ตอนนี้" }));
  await page.keyboard.press("Enter");
  await expect.poll(() => heard).toContain("playNow");
  await bot.quit();
});
