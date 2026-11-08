import { setFakeDiscordUser } from "@narze/fake-discord";
import { Channels, DEFAULT_REDIS_URL, PlayerCommandSchema, RedisKeys } from "@narze/shared";
import { expect, test } from "@playwright/test";
import Redis from "ioredis";
import { signInThroughPopup } from "./support";

const G_LIB = "939000000000000001";
const wen = { id: "490000000000000107", username: "wen107", globalName: "Wen" };
const PLAYLIST_URL = "https://www.youtube.com/playlist?list=PLE2E";
const url = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
const redis = new Redis(url);
const bot = new Redis(url);
const received: unknown[] = [];

test.beforeAll(async () => {
  await redis.sadd(RedisKeys.botGuilds, G_LIB);
  await redis.hset(RedisKeys.voiceStates(G_LIB), wen.id, "93");
  await bot.subscribe(Channels.botCommands);
  bot.on("message", (_c, raw) => {
    const command = PlayerCommandSchema.parse(JSON.parse(raw));
    received.push(command);
    void redis.publish(Channels.botCommandResults, JSON.stringify({ id: command.id, ok: true }));
  });
});

test.afterAll(async () => {
  await redis.srem(RedisKeys.botGuilds, G_LIB);
  await redis.del(RedisKeys.voiceStates(G_LIB));
  await bot.quit();
  await redis.quit();
});

test("import a playlist, rename it (another tab follows), play it all, then delete it (#107)", async ({
  page,
  context,
}) => {
  await setFakeDiscordUser(wen, [{ id: G_LIB, name: "Library Club", icon: null, owner: false }]);
  await signInThroughPopup(page, "Wen");
  await page.goto("/library");

  await page.getByRole("button", { name: "นำเข้า Playlist" }).click();
  const dialog = page.getByRole("dialog", { name: "นำเข้า Playlist" });
  await dialog.getByLabel("ลิงก์ Playlist ของ Spotify หรือ YouTube").fill(PLAYLIST_URL);
  await dialog.getByRole("button", { name: "ดูตัวอย่าง" }).click();
  await expect(dialog.getByText("E2E Mix")).toBeVisible();
  await expect(dialog.getByText("2 เพลง")).toBeVisible();
  await dialog.getByLabel("ชื่อ").fill("My Import");
  await dialog.getByRole("button", { name: "บันทึก" }).click();

  await page.getByRole("link", { name: /My Import/ }).click();
  await expect(page.getByRole("heading", { name: "My Import", level: 1 })).toBeVisible();
  await expect(page.getByTestId("library-track")).toHaveText([/Lemon/, /Idol/]);

  const other = await context.newPage();
  await other.goto(page.url());
  await page.getByRole("button", { name: "เปลี่ยนชื่อ" }).click();
  await page.getByLabel("ชื่อ Playlist").fill("Renamed Mix");
  await page.getByRole("button", { name: "บันทึกชื่อ" }).click();
  await expect(other.getByRole("heading", { name: "Renamed Mix", level: 1 })).toBeVisible({ timeout: 2000 });

  // Track edits: remove one; the other tab follows too.
  await page.getByRole("button", { name: "ลบ Idol ออกจาก Playlist" }).click();
  await expect(other.getByTestId("library-track")).toHaveText([/Lemon/], { timeout: 2000 });

  await page.getByRole("button", { name: "เล่นทั้งหมด" }).click();
  await page
    .getByRole("dialog", { name: "เลือกเซิร์ฟเวอร์" })
    .getByRole("button", { name: /Library Club/ })
    .click();
  await expect.poll(() => received.length).toBeGreaterThan(0);
  expect(received.at(-1)).toMatchObject({ guildId: G_LIB, command: { action: "play", query: PLAYLIST_URL } });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "ลบ Playlist" }).click();
  await page.getByRole("dialog", { name: "ลบ Playlist นี้?" }).getByRole("button", { name: "ลบ" }).click();
  await expect(page).toHaveURL("/library");
  await expect(page.getByRole("link", { name: /Renamed Mix/ })).toHaveCount(0);
});

test("liking a track in search puts it in Liked; unliking takes it out (#107, AC4)", async ({ page }) => {
  await setFakeDiscordUser(wen, [{ id: G_LIB, name: "Library Club", icon: null, owner: false }]);
  await signInThroughPopup(page, "Wen");
  await page.goto("/search");
  await page.getByRole("tab", { name: "YouTube Music" }).click();
  await page.getByRole("searchbox", { name: "ค้นหาเพลง ศิลปิน หรืออัลบั้ม" }).fill("lemon");
  const heart = page.getByRole("button", { name: "ถูกใจ Lemon" });
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "true");

  await page.goto("/library/liked");
  await expect(page.getByTestId("library-track")).toHaveText([/Lemon/]);
  await page.getByRole("button", { name: "ถูกใจ Lemon" }).click();
  await expect(page.getByTestId("library-track")).toHaveCount(0);
});
