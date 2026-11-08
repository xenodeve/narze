import { setFakeDiscordUser } from "@narze/fake-discord";
import { localSupabase } from "@narze/fake-discord/supabase-local";
import {
  Channels,
  DEFAULT_REDIS_URL,
  type GuildEvent,
  GuildEventTypes,
  type PlayerSummary,
  RedisKeys,
} from "@narze/shared";
import { expect, type Page, test } from "@playwright/test";
import Redis from "ioredis";
import { AUTH_STORAGE_KEY } from "../src/lib/supabase";
import { signInThroughPopup } from "./support";

const BACKEND = "http://localhost:4100";
const G_OWNED = "930000000000000001";
const G_MEMBER = "930000000000000002";
const G_WITHOUT_BOT = "930000000000000003";
const supabase = localSupabase();
const redis = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);

const carol = { id: "400000000000000001", username: "carol", globalName: "Carol" };
const carolGuilds = [
  { id: G_OWNED, name: "Carol home", icon: null, owner: true },
  { id: G_MEMBER, name: "Listening club", icon: null, owner: false },
  { id: G_WITHOUT_BOT, name: "Bot-free zone", icon: null, owner: false },
];

test.beforeAll(async () => {
  await redis.sadd(RedisKeys.botGuilds, G_OWNED, G_MEMBER);
  await redis.del(RedisKeys.playerSummary(G_MEMBER), RedisKeys.voiceStates(G_MEMBER));
  await setFakeDiscordUser(carol, carolGuilds);
});

test.afterAll(async () => {
  await redis.srem(RedisKeys.botGuilds, G_OWNED, G_MEMBER);
  await redis.del(RedisKeys.playerSummary(G_MEMBER));
  await redis.quit();
});

async function storedAccessToken(page: Page): Promise<string> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), AUTH_STORAGE_KEY);
  return (JSON.parse(raw ?? "{}") as { access_token: string }).access_token;
}

test("Discord sign-in in a popup lists only Mutual Guilds, updates live, and Sign Out revokes the token", async ({
  page,
  request,
}) => {
  await signInThroughPopup(page, "Carol");
  const rows = page.getByTestId("guild-row");
  await expect(rows).toHaveCount(2);
  await expect(page.getByText("Bot-free zone")).toHaveCount(0);
  const owned = page.locator(`[data-guild-id="${G_OWNED}"]`);
  const member = page.locator(`[data-guild-id="${G_MEMBER}"]`);
  await expect(owned.getByTestId("guild-badge")).toContainText("OWNER");
  await expect(member.getByTestId("guild-player")).toHaveText("ว่าง");

  // The Bot sets the summary, then announces it (RedisKeys.playerSummary).
  const summary: PlayerSummary = { playing: true, queueLength: 4, voiceChannelId: "55" };
  await redis.set(RedisKeys.playerSummary(G_MEMBER), JSON.stringify(summary));
  const event: GuildEvent = {
    type: GuildEventTypes.playerSummary,
    guildId: G_MEMBER,
    revision: 1,
    sequence: 1,
    ts: Date.now(),
    data: summary,
  };
  await redis.publish(Channels.guildEvents, JSON.stringify(event));
  await expect(member.getByTestId("guild-player")).toContainText("กำลังเล่น");
  await expect(member.getByTestId("guild-player")).toContainText("คิว 4 เพลง");

  const token = await storedAccessToken(page);
  expect(
    (await request.get(`${BACKEND}/api/me/guilds`, { headers: { authorization: `Bearer ${token}` } })).status(),
  ).toBe(200);
  await page.getByRole("button", { name: "ออกจากระบบ" }).click();
  await expect(page.getByRole("button", { name: "เข้าสู่ระบบด้วย Discord" })).toBeVisible();
  await expect(rows).toHaveCount(0);
  expect(
    (await request.get(`${BACKEND}/api/me/guilds`, { headers: { authorization: `Bearer ${token}` } })).status(),
  ).toBe(401);
});

test("with popups blocked, sign-in falls back to a full-page redirect and lands home signed in", async ({ page }) => {
  await page.addInitScript(() => {
    window.open = () => null;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "เข้าสู่ระบบด้วย Discord" }).click();
  await page.waitForURL("http://localhost:3100/");
  await expect(page.getByTestId("account-name")).toHaveText("Carol");
  await page.getByRole("button", { name: "ออกจากระบบ" }).click();
});

test("a forged OAuth state is refused by Supabase Auth", async ({ request }) => {
  const res = await request.get(`${supabase.url}/auth/v1/callback?code=any&state=forged`, { maxRedirects: 0 });
  expect(res.status()).toBe(303);
  expect(res.headers().location).toContain("error_code=bad_oauth_state");
});

test("a callback with a code this browser did not start is rejected and stays signed out", async ({ page }) => {
  await page.goto("/auth/callback?code=forged-code");
  await expect(page.getByRole("heading", { name: "เข้าสู่ระบบไม่สำเร็จ" })).toBeVisible();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), AUTH_STORAGE_KEY)).toBeNull();
});
