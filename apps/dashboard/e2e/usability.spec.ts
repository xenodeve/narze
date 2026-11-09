import { setFakeDiscordUser } from "@narze/fake-discord";
import { Channels, DEFAULT_REDIS_URL, GuildEventTypes, type PlayerState, RedisKeys } from "@narze/shared";
import { expect, test } from "@playwright/test";
import Redis from "ioredis";
import { signInThroughPopup, stubDiscordCdn } from "./support";

const G_PLAY = "949000000000000001";
const G_IDLE = "949000000000000002";
const sol = { id: "499000000000000001", username: "sol", globalName: "Sol" };
const redis = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);
const RUN = Date.now();

async function playing(): Promise<void> {
  const state: PlayerState = {
    guildId: G_PLAY,
    current: {
      uri: "https://music.youtube.com/watch?v=nameless",
      source: "youtubemusic",
      title: "Nameless",
      author: "",
      durationMs: 180_000,
      artworkUrl: null,
      requester: { id: sol.id, name: "Sol", avatarUrl: null },
    },
    positionMs: 0,
    syncedAt: Date.now(),
    paused: false,
    volume: 15,
    loop: "off",
    twentyFourSeven: false,
    queue: [],
    revision: 1,
    epoch: `usability-e2e-${RUN}`,
    lastSeekAt: null,
    voiceChannelId: "93",
  };
  await redis.set(RedisKeys.playerState(G_PLAY), JSON.stringify(state));
  await redis.publish(
    Channels.guildEvents,
    JSON.stringify({
      type: GuildEventTypes.playerState,
      guildId: G_PLAY,
      revision: 1,
      sequence: 1,
      ts: Date.now(),
      data: state,
    }),
  );
}

test.beforeAll(async () => {
  await redis.sadd(RedisKeys.botGuilds, G_PLAY, G_IDLE);
  await redis.hset(RedisKeys.voiceStates(G_PLAY), sol.id, "93");
  await redis.del(RedisKeys.playerState(G_IDLE), RedisKeys.playerSummary(G_IDLE));
  await playing();
});

test.afterAll(async () => {
  await redis.srem(RedisKeys.botGuilds, G_PLAY, G_IDLE);
  await redis.del(RedisKeys.playerState(G_PLAY), RedisKeys.voiceStates(G_PLAY));
  await redis.quit();
});

test("signed out, every prompt to sign in has the button (#176)", async ({ page }) => {
  await page.goto("/search");
  await expect(page.getByRole("main").getByRole("button", { name: "เข้าสู่ระบบด้วย Discord" })).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("main").getByRole("button", { name: "เข้าสู่ระบบด้วย Discord" })).toBeVisible();
});

test("the stage drops dead controls when idle, says why shuffle is off, and speaks Thai for a missing artist (#176)", async ({
  page,
}) => {
  await stubDiscordCdn(page);
  await setFakeDiscordUser(sol, [
    { id: G_PLAY, name: "Busy Room", icon: null, owner: true },
    { id: G_IDLE, name: "Quiet Room", icon: null, owner: true },
  ]);
  await signInThroughPopup(page, "Sol");

  await page.goto(`/guilds/${G_IDLE}`);
  await expect(page.getByRole("heading", { name: "ยังไม่มีเพลงเล่นอยู่" })).toBeVisible();
  await expect(page.getByRole("group", { name: "ควบคุมการเล่น" })).toHaveCount(0);
  await expect(page.getByLabel("ชื่อเพลงหรือลิงก์")).toBeVisible();

  await page.goto(`/guilds/${G_PLAY}`);
  await expect(page.getByText("ไม่ทราบชื่อศิลปิน")).toBeVisible();
  await expect(page.getByRole("button", { name: "สลับคิว" })).toHaveAttribute("title", /อย่างน้อย 2 เพลง/);

  // Home offers the way back to the last server.
  await page.goto("/");
  await page.getByRole("link", { name: /กลับไปที่ Busy Room/ }).click();
  await expect(page).toHaveURL(`/guilds/${G_PLAY}`);
});

test("a failed server list offers a retry that works (#176)", async ({ page }) => {
  await setFakeDiscordUser(sol, [{ id: G_PLAY, name: "Busy Room", icon: null, owner: true }]);
  await signInThroughPopup(page, "Sol");
  let fail = true;
  await page.route("**/api/me/guilds", (route) => (fail ? route.fulfill({ status: 500 }) : route.continue()));
  await page.goto("/");
  const retry = page.getByRole("main").getByRole("button", { name: "ลองอีกครั้ง" });
  await expect(retry).toBeVisible();
  // Past the socket handshake's own refetch (still failing), so only the button can recover it.
  await page.waitForTimeout(1500);
  await expect(retry).toBeVisible();
  fail = false;
  await retry.click();
  await expect(page.getByTestId("guild-row")).toHaveCount(1);
});
