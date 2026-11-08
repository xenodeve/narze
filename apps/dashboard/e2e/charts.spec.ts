import { setFakeDiscordUser } from "@narze/fake-discord";
import { Channels, DEFAULT_REDIS_URL, PlayerCommandSchema, RedisKeys } from "@narze/shared";
import { expect, test } from "@playwright/test";
import Redis from "ioredis";
import { signInThroughPopup } from "./support";

const G = "941000000000000001";
const pim = { id: "490000000000000309", username: "pim109", globalName: "Pim" };
const url = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
const redis = new Redis(url);
const bot = new Redis(url);
const received: unknown[] = [];

test.beforeAll(async () => {
  await redis.sadd(RedisKeys.botGuilds, G);
  await redis.hset(RedisKeys.voiceStates(G), pim.id, "93");
  // Start from the feed, not a copy an earlier run cached.
  await redis.del(RedisKeys.chart("th"), RedisKeys.chart("us"));
  await bot.subscribe(Channels.botCommands);
  bot.on("message", (_c, raw) => {
    const command = PlayerCommandSchema.parse(JSON.parse(raw));
    received.push(command);
    void redis.publish(Channels.botCommandResults, JSON.stringify({ id: command.id, ok: true }));
  });
});

test.afterAll(async () => {
  await redis.srem(RedisKeys.botGuilds, G);
  await redis.del(RedisKeys.voiceStates(G));
  // The fake chart must not linger for a dev Backend sharing this Redis.
  await redis.del(RedisKeys.chart("th"), RedisKeys.chart("us"));
  await bot.quit();
  await redis.quit();
});

test("the idle guild page shows the chart; a song plays; a chart that is down says so (#109, AC3, AC4)", async ({
  page,
}) => {
  await setFakeDiscordUser(pim, [{ id: G, name: "Chart Club", icon: null, owner: false }]);
  await signInThroughPopup(page, "Pim");
  await page.goto(`/guilds/${G}`);
  const chart = page.getByRole("region", { name: "ชาร์ตเพลง" });
  await expect(chart.getByTestId("chart-entry")).toHaveText([/1.*Lemon.*Kenshi Yonezu/, /2.*Idol.*YOASOBI/]);
  await chart.getByRole("button", { name: "เล่น Lemon จากชาร์ต" }).click();
  await expect.poll(() => received.length).toBeGreaterThan(0);
  expect(received.at(-1)).toMatchObject({ guildId: G, command: { action: "play", query: "Lemon Kenshi Yonezu" } });

  await chart.getByRole("tab", { name: "สหรัฐฯ" }).click();
  await expect(chart.getByRole("status")).toHaveText(/ชาร์ตนี้ยังโหลดไม่ได้/);
  await expect(chart.getByTestId("chart-entry")).toHaveCount(0);
});
