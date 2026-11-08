import { setFakeDiscordUser } from "@narze/fake-discord";
import {
  Channels,
  DEFAULT_REDIS_URL,
  type GuildEvent,
  GuildEventTypes,
  type PlayerState,
  RedisKeys,
} from "@narze/shared";
import { expect, test } from "@playwright/test";
import Redis from "ioredis";
import { signInThroughPopup } from "./support";

const GUILD = "931000000000000001";
const frank = { id: "410000000000000001", username: "frank", globalName: "Frank" };
const redis = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);
let revision = 100;

const state = (title: string, over: Partial<PlayerState> = {}): PlayerState => ({
  guildId: GUILD,
  current: {
    uri: `https://music.youtube.com/watch?v=${encodeURIComponent(title)}`,
    source: "youtubemusic",
    title,
    author: "Narze Test",
    durationMs: 200_000,
    artworkUrl: null,
    requester: { id: frank.id, name: "Frank", avatarUrl: null },
  },
  positionMs: 30_000,
  syncedAt: Date.now(),
  paused: false,
  volume: 15,
  loop: "off",
  twentyFourSeven: false,
  queue: [],
  revision: ++revision,
  epoch: "e2e",
  lastSeekAt: null,
  voiceChannelId: "90",
  ...over,
});

/** What the Bot does on every change: set the key, then announce it (RedisKeys.playerState). */
async function botPublishes(s: PlayerState): Promise<void> {
  await redis.set(RedisKeys.playerState(GUILD), JSON.stringify(s));
  const event: GuildEvent = {
    type: GuildEventTypes.playerState,
    guildId: GUILD,
    revision: s.revision,
    sequence: s.revision,
    ts: Date.now(),
    data: s,
  };
  await redis.publish(Channels.guildEvents, JSON.stringify(event));
}

test.beforeAll(async () => {
  await redis.sadd(RedisKeys.botGuilds, GUILD);
  await redis.del(RedisKeys.playerState(GUILD));
  await setFakeDiscordUser(frank, [{ id: GUILD, name: "Now Playing Club", icon: null, owner: false }]);
});

test.afterAll(async () => {
  await redis.srem(RedisKeys.botGuilds, GUILD);
  await redis.del(RedisKeys.playerState(GUILD));
  await redis.quit();
});

test("a track started elsewhere shows on every open tab within 1 s, and the server row leads here", async ({
  page,
  context,
}) => {
  await signInThroughPopup(page, "Frank");
  await page.getByRole("link", { name: "Now Playing Club" }).click();
  await expect(page).toHaveURL(`/guilds/${GUILD}`);
  expect(await page.evaluate(() => sessionStorage.getItem("selectedGuildId"))).toBe(GUILD);
  await expect(page.getByRole("heading", { name: "ยังไม่มีเพลงเล่นอยู่" })).toBeVisible();

  const second = await context.newPage();
  await second.goto(`/guilds/${GUILD}`);
  await expect(second.getByRole("heading", { name: "ยังไม่มีเพลงเล่นอยู่" })).toBeVisible();

  await botPublishes(state("Lemon"));
  await expect(page.getByTestId("now-title")).toHaveText("Lemon", { timeout: 1000 });
  await expect(second.getByTestId("now-title")).toHaveText("Lemon", { timeout: 1000 });
  await expect(second.getByText("ขอโดย Frank")).toBeVisible();
});

test("a page load reads the Hot Cache: the state renders after its Redis key is gone", async ({ page }) => {
  await signInThroughPopup(page, "Frank");
  await botPublishes(state("Cached Song"));
  await page.goto(`/guilds/${GUILD}`);
  await expect(page.getByTestId("now-title")).toHaveText("Cached Song");
  await redis.del(RedisKeys.playerState(GUILD));
  await page.reload();
  await expect(page.getByTestId("now-title")).toHaveText("Cached Song");
});

test("progress runs forward from the published position while playing", async ({ page }) => {
  await signInThroughPopup(page, "Frank");
  await botPublishes(state("Running", { positionMs: 61_000 }));
  await page.goto(`/guilds/${GUILD}`);
  const elapsed = page.getByTestId("elapsed");
  await expect(elapsed).toHaveText(/^1:0[1-3]$/);
  await expect(elapsed).toHaveText(/^1:0[3-6]$/, { timeout: 4000 });
});

test("an Idle Player with 24/7 shows as waiting in voice, not as no Player (#103)", async ({ page }) => {
  await signInThroughPopup(page, "Frank");
  await page.goto(`/guilds/${GUILD}`);
  await botPublishes(state("Last Song"));
  await expect(page.getByTestId("now-title")).toHaveText("Last Song");
  await botPublishes(state("", { current: null, twentyFourSeven: true, positionMs: 0 }));
  await expect(page.getByRole("heading", { name: "ยังไม่มีเพลงเล่นอยู่" })).toBeVisible();
  await expect(page.getByTestId("idle-247")).toHaveText("24/7 · บอทรออยู่ในห้องเสียง");
});

test("a Player being restored after a Bot restart says so until it plays (#103)", async ({ page }) => {
  await signInThroughPopup(page, "Frank");
  await page.goto(`/guilds/${GUILD}`);
  await botPublishes(state("", { current: null, recovering: true, queue: [] }));
  await expect(page.getByTestId("recovering")).toHaveText("กำลังกู้คิวหลังบอทรีสตาร์ท…");
  await botPublishes(state("Restored Song"));
  await expect(page.getByTestId("now-title")).toHaveText("Restored Song");
  await expect(page.getByTestId("recovering")).toHaveCount(0);
});

test("a voice drop shows while the Bot reconnects, and clears when it is back (#103, spec #28)", async ({ page }) => {
  const voice = async (type: string, data: Record<string, unknown>) =>
    redis.publish(
      Channels.guildEvents,
      JSON.stringify({ type, guildId: GUILD, revision: 0, sequence: 0, ts: Date.now(), data }),
    );
  await signInThroughPopup(page, "Frank");
  await page.goto(`/guilds/${GUILD}`);
  await botPublishes(state("Dropping Song"));
  await expect(page.getByTestId("now-title")).toHaveText("Dropping Song");

  // These events are drawn, not cached: one sent before the tab joined the Guild room is gone,
  // so the first is repeated until the tab shows it (the socket is then surely in the room).
  await expect(async () => {
    await voice(GuildEventTypes.voiceDisconnect, { code: 4006, reason: "x", byRemote: false, recovering: true });
    await expect(page.getByTestId("voice-status")).toHaveText("เสียงหลุด กำลังต่อใหม่…", { timeout: 500 });
  }).toPass();
  await voice(GuildEventTypes.voiceReconnected, { resumed: true, positionMs: 1000, title: "Dropping Song" });
  await expect(page.getByTestId("voice-status")).toHaveCount(0);

  await voice(GuildEventTypes.voiceDisconnect, { code: 4006, reason: "x", byRemote: false, recovering: true });
  await voice(GuildEventTypes.voiceReconnectFailed, { error: "x" });
  await expect(page.getByTestId("voice-status")).toHaveText("ต่อเสียงใหม่ไม่สำเร็จ ลองใช้ /join");
});

test("an Idle Player shows a voice drop too, and a Player that is gone clears it (#103)", async ({ page }) => {
  const send = async (type: string, data: unknown) =>
    redis.publish(
      Channels.guildEvents,
      JSON.stringify({ type, guildId: GUILD, revision: 0, sequence: 0, ts: Date.now(), data }),
    );
  await signInThroughPopup(page, "Frank");
  await page.goto(`/guilds/${GUILD}`);
  await botPublishes(state("", { current: null, twentyFourSeven: true, positionMs: 0 }));
  await expect(page.getByTestId("idle-247")).toBeVisible();
  await expect(async () => {
    await send(GuildEventTypes.voiceDisconnect, { code: 4006, reason: "x", byRemote: false, recovering: true });
    await expect(page.getByTestId("voice-status")).toHaveText("เสียงหลุด กำลังต่อใหม่…", { timeout: 500 });
  }).toPass();
  await redis.del(RedisKeys.playerState(GUILD));
  await send(GuildEventTypes.playerGone, null);
  await expect(page.getByTestId("voice-status")).toHaveCount(0);
});
