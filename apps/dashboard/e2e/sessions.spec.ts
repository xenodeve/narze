import { setFakeDiscordUser } from "@narze/fake-discord";
import { localSupabase } from "@narze/fake-discord/supabase-local";
import {
  Channels,
  DEFAULT_REDIS_URL,
  GuildEventTypes,
  type ListeningSession,
  PlayerCommandSchema,
  RedisKeys,
  sessionEvent,
  trackKey,
} from "@narze/shared";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import Redis from "ioredis";
import { signInThroughPopup } from "./support";

const G = "940000000000000001";
const nok = { id: "490000000000000208", username: "nok108", globalName: "Nok" };
const url = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
const redis = new Redis(url);
const bot = new Redis(url);
const received: unknown[] = [];
const supabase = localSupabase();
const admin = createClient(supabase.url, supabase.secretKey, { auth: { persistSession: false } });
const nokAsRequester = { id: nok.id, name: "Nok", avatarUrl: null };
const SESSION_ID = `${G}-1700000000000`;

const session = (over: Partial<ListeningSession> = {}): ListeningSession => ({
  id: SESSION_ID,
  guildId: G,
  guildName: "Session Club",
  channelId: "940000000000000093",
  startTime: Date.now() - 15 * 60_000,
  endTime: null,
  isActive: true,
  tracks: [
    {
      title: "Idol",
      author: "YOASOBI",
      uri: "https://www.youtube.com/watch?v=idol",
      thumbnail: null,
      durationMs: 213_000,
      playedAt: Date.now() - 15 * 60_000,
      requester: nokAsRequester,
    },
  ],
  participants: [{ ...nokAsRequester, joinedAt: Date.now() - 15 * 60_000 }],
  ...over,
});

test.beforeAll(async () => {
  await redis.sadd(RedisKeys.botGuilds, G);
  await redis.hset(RedisKeys.voiceStates(G), nok.id, "93");
  await admin.from("listening_sessions").delete().eq("guild_id", G);
  await admin.from("play_history").delete().eq("guild_id", G);
  await admin.from("play_history").delete().eq("discord_id", nok.id);
  await bot.subscribe(Channels.botCommands);
  bot.on("message", (_c, raw) => {
    const command = PlayerCommandSchema.parse(JSON.parse(raw));
    received.push(command);
    void redis.publish(Channels.botCommandResults, JSON.stringify({ id: command.id, ok: true }));
  });
});

test.afterAll(async () => {
  await admin.from("listening_sessions").delete().eq("guild_id", G);
  await admin.from("play_history").delete().eq("guild_id", G);
  await admin.from("play_history").delete().eq("discord_id", nok.id);
  await redis.srem(RedisKeys.botGuilds, G);
  await redis.del(RedisKeys.voiceStates(G));
  await bot.quit();
  await redis.quit();
});

const publish = (type: string, data: ListeningSession) =>
  redis.publish(
    Channels.guildEvents,
    JSON.stringify({ type, guildId: G, revision: 0, sequence: 0, ts: Date.now(), data: sessionEvent(data) }),
  );

test("a session shows up live, and its detail replays a track into a server (#108, AC5)", async ({ page }) => {
  await page.route("https://cdn.discordapp.com/**", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await setFakeDiscordUser(nok, [{ id: G, name: "Session Club", icon: "5e55", owner: false }]);
  await signInThroughPopup(page, "Nok");
  await page.goto("/sessions");
  await expect(page.getByRole("heading", { name: "ประวัติการฟัง", level: 1 })).toBeVisible();
  await expect(page.getByTestId("session-card")).toHaveCount(0);

  // The Bot saves a new session at once, then announces it to its participants.
  await admin.from("listening_sessions").insert({
    id: SESSION_ID,
    guild_id: G,
    guild_name: "Session Club",
    channel_id: "940000000000000093",
    start_time: session().startTime,
    is_active: true,
    tracks: session().tracks,
    participants: session().participants,
    participant_ids: [nok.id],
    track_count: 1,
  });
  await publish(GuildEventTypes.sessionUpdate, session());
  const card = page.getByTestId("session-card");
  await expect(card).toHaveCount(1, { timeout: 2000 });
  await expect(card).toContainText("Session Club");
  // The server's own picture beside its name (#170).
  const sessionIcon = `https://cdn.discordapp.com/icons/${G}/5e55.png?size=96`;
  await expect(card.getByTestId("guild-icon")).toHaveAttribute("src", sessionIcon);
  await expect(card.getByText("Live")).toBeVisible();
  await expect(card).toContainText("1 เพลง");

  // The search runs on the server: by server name, people and track.
  await page.getByRole("searchbox", { name: "ค้นหาเซสชัน" }).fill("nothing like it");
  await expect(card).toHaveCount(0);
  await page.getByRole("searchbox", { name: "ค้นหาเซสชัน" }).fill("idol");
  await expect(card).toHaveCount(1);

  await card.getByRole("link").click();
  await expect(page.getByRole("heading", { name: "Session Club", level: 1 })).toBeVisible();
  await expect(page.locator("header").getByTestId("guild-icon")).toHaveAttribute("src", sessionIcon);
  await expect(page.getByTestId("session-track")).toHaveText([/Idol.*Nok/]);
  await page.getByRole("button", { name: "เล่น Idol" }).click();
  await page
    .getByRole("dialog", { name: "เลือกเซิร์ฟเวอร์" })
    .getByRole("button", { name: /Session Club/ })
    .click();
  await expect.poll(() => received.length).toBeGreaterThan(0);
  expect(received.at(-1)).toMatchObject({
    guildId: G,
    command: { action: "play", query: "https://www.youtube.com/watch?v=idol" },
  });
  await page.keyboard.press("Escape");

  // The Bot leaves voice: the session ends live on the open list.
  await page.goto("/sessions");
  await expect(page.getByTestId("session-card").getByText("Live")).toHaveCount(1);
  // As the Bot does: the row first, then the announcement (a tab that reloads reads the row).
  const ended = Date.now();
  await admin.from("listening_sessions").update({ is_active: false, end_time: ended }).eq("id", SESSION_ID);
  await publish(GuildEventTypes.sessionEnd, session({ isActive: false, endTime: ended }));
  await expect(page.getByTestId("session-card").getByText("Live")).toHaveCount(0, { timeout: 2000 });
});

test("with nothing playing, the guild page offers my top-played and the server's; a click plays it (#108, AC4)", async ({
  page,
}) => {
  const play = (title: string) => ({
    trackId: trackKey(title, "YOASOBI"),
    title,
    artist: "YOASOBI",
    uri: `https://www.youtube.com/watch?v=${title.toLowerCase()}`,
    thumbnail: null,
    durationMs: 200_000,
    source: "youtube",
    isMusic: true,
    isVideo: false,
  });
  for (const title of ["Yoru", "Yoru", "Gunjou"]) {
    await admin.rpc("record_play", { p_guild: G, p_user: nok.id, p_track: play(title) });
  }
  await setFakeDiscordUser(nok, [{ id: G, name: "Session Club", icon: null, owner: false }]);
  await signInThroughPopup(page, "Nok");
  await page.goto(`/guilds/${G}`);
  const mine = page.getByRole("region", { name: "เพลงที่คุณเล่นบ่อย" });
  const server = page.getByRole("region", { name: "เพลงฮิตในเซิร์ฟเวอร์นี้" });
  await expect(mine.getByTestId("top-played")).toHaveText([/Yoru.*2/, /Gunjou.*1/]);
  await expect(server.getByTestId("top-played")).toHaveText([/Yoru.*2/, /Gunjou.*1/]);
  const before = received.length;
  await mine.getByRole("button", { name: "เล่น Yoru" }).click();
  await expect.poll(() => received.length).toBeGreaterThan(before);
  expect(received.at(-1)).toMatchObject({
    guildId: G,
    command: { action: "play", query: "https://www.youtube.com/watch?v=yoru" },
  });
});
