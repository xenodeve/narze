import { setFakeDiscordUser } from "@narze/fake-discord";
import { Channels, DEFAULT_REDIS_URL, PlayerCommandSchema, RedisKeys } from "@narze/shared";
import { expect, test } from "@playwright/test";
import Redis from "ioredis";
import { signInThroughPopup } from "./support";

const G_PLAY = "936000000000000001";
const G_FAR = "936000000000000002";
const hana = { id: "460000000000000001", username: "hana", globalName: "Hana" };
const url = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
const redis = new Redis(url);
const bot = new Redis(url);
const received: unknown[] = [];

test.beforeAll(async () => {
  await redis.sadd(RedisKeys.botGuilds, G_PLAY, G_FAR);
  await redis.del(RedisKeys.playerSummary(G_PLAY), RedisKeys.playerSummary(G_FAR));
  // Hana is in a voice channel of Play Club only; Far Club has no Player and she is not in voice.
  await redis.hset(RedisKeys.voiceStates(G_PLAY), hana.id, "93");
  await bot.subscribe(Channels.botCommands);
  bot.on("message", (_channel, raw) => {
    const command = PlayerCommandSchema.parse(JSON.parse(raw));
    received.push(command);
    void redis.publish(Channels.botCommandResults, JSON.stringify({ id: command.id, ok: true }));
  });
});

test.afterAll(async () => {
  await redis.srem(RedisKeys.botGuilds, G_PLAY, G_FAR);
  await redis.del(RedisKeys.voiceStates(G_PLAY));
  await bot.quit();
  await redis.quit();
});

test("search, open an artist, and play a track into the chosen server (#105)", async ({ page }) => {
  await setFakeDiscordUser(hana, [
    { id: G_PLAY, name: "Play Club", icon: null, owner: false },
    { id: G_FAR, name: "Far Club", icon: null, owner: false },
  ]);
  await signInThroughPopup(page, "Hana");
  await page.goto("/search");

  await page.getByRole("searchbox", { name: "ค้นหาเพลง ศิลปิน หรืออัลบั้ม" }).fill("yoasobi");
  const top = page.getByTestId("top-result");
  await expect(top).toContainText("YOASOBI");
  await expect(top).toContainText("ตรง 100%");
  await top.getByRole("link", { name: "YOASOBI" }).click();

  await expect(page).toHaveURL("/artist/a1");
  await expect(page.getByRole("heading", { name: "YOASOBI", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "THE BOOK" })).toBeVisible();
  await page.getByRole("button", { name: "เล่น Idol" }).click();

  const dialog = page.getByRole("dialog", { name: "เลือกเซิร์ฟเวอร์" });
  await expect(dialog.getByRole("button", { name: /Far Club/ })).toBeDisabled();
  await expect(dialog.getByText("เข้าห้องเสียงก่อนถึงจะเริ่มเล่นได้")).toBeVisible();
  await dialog.getByRole("button", { name: /Play Club/ }).click();
  await expect(dialog.getByText("เพิ่ม Idol ใน Play Club แล้ว")).toBeVisible();
  expect(received).toContainEqual(
    expect.objectContaining({
      guildId: G_PLAY,
      command: expect.objectContaining({ action: "play", query: "https://open.spotify.com/track/t1" }),
    }),
  );
});

test("YouTube Music mode searches through Lavalink and marks the source (#105, spec #57)", async ({ page }) => {
  await setFakeDiscordUser(hana, [{ id: G_PLAY, name: "Play Club", icon: null, owner: false }]);
  await signInThroughPopup(page, "Hana");
  await page.goto("/search");
  await page.getByRole("tab", { name: "YouTube Music" }).click();
  await page.getByRole("searchbox", { name: "ค้นหาเพลง ศิลปิน หรืออัลบั้ม" }).fill("lemon");
  const row = page.getByTestId("song-row").first();
  await expect(row).toContainText("Lemon");
  await expect(row).toContainText("YT Music");
});

test("the guild page's Search tab adds straight into that server, no server picker (#105, spec #85)", async ({
  page,
}) => {
  received.length = 0;
  await setFakeDiscordUser(hana, [{ id: G_PLAY, name: "Play Club", icon: null, owner: false }]);
  await signInThroughPopup(page, "Hana");
  await page.goto(`/guilds/${G_PLAY}`);
  await page.getByRole("tab", { name: "ค้นหา" }).click();
  await page.getByRole("searchbox", { name: "ค้นหาเพลง ศิลปิน หรืออัลบั้ม" }).fill("idol");
  // The Search tab's results, not the idle page's chart or top-played rows.
  await page.getByRole("tabpanel").getByRole("button", { name: "เล่น Idol" }).first().click();
  await expect(page.getByText("เพิ่ม Idol แล้ว")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "เลือกเซิร์ฟเวอร์" })).toHaveCount(0);
  expect(received).toContainEqual(
    expect.objectContaining({
      guildId: G_PLAY,
      command: expect.objectContaining({ query: "https://open.spotify.com/track/t1" }),
    }),
  );
});
