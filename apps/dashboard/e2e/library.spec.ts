import { setFakeDiscordUser } from "@narze/fake-discord";
import { Channels, DEFAULT_REDIS_URL, PlayerCommandSchema, RedisKeys } from "@narze/shared";
import { expect, test } from "@playwright/test";
import Redis from "ioredis";
import { signInThroughPopup } from "./support";

const G_LIB = "939000000000000001";
const wen = { id: "490000000000000107", username: "wen107", globalName: "Wen" };
const kai = { id: "490000000000000108", username: "kai107", globalName: "Kai" };
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

  // Track edits: reorder, then remove one; the other tab follows both.
  await page.getByRole("button", { name: "เลื่อน Idol ขึ้น" }).click();
  await expect(other.getByTestId("library-track")).toHaveText([/Idol/, /Lemon/], { timeout: 2000 });
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

  // This playlist, by its id: an earlier run that failed may have left one with the same name.
  const href = new URL(page.url()).pathname;
  await page.getByRole("button", { name: "ลบ Playlist" }).click();
  await page.getByRole("dialog", { name: "ลบ Playlist นี้?" }).getByRole("button", { name: "ลบ" }).click();
  await expect(page).toHaveURL("/library");
  await expect(page.locator(`a[href="${href}"]`)).toHaveCount(0);
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

test("a playlist made in the app starts empty; with no source playlist, play-all is off (#107)", async ({ page }) => {
  await setFakeDiscordUser(wen, [{ id: G_LIB, name: "Library Club", icon: null, owner: false }]);
  await signInThroughPopup(page, "Wen");
  await page.goto("/library");
  await page.getByRole("button", { name: "สร้าง Playlist" }).click();
  const dialog = page.getByRole("dialog", { name: "สร้าง Playlist" });
  await dialog.getByLabel("ชื่อ").fill("Made Here");
  await dialog.getByRole("button", { name: "สร้าง" }).click();
  await page.getByRole("link", { name: /Made Here/ }).click();
  await expect(page.getByRole("heading", { name: "Made Here", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "เล่นทั้งหมด" })).toBeDisabled();
  await page.getByRole("button", { name: "ลบ Playlist" }).click();
  await page.getByRole("dialog", { name: "ลบ Playlist นี้?" }).getByRole("button", { name: "ลบ" }).click();
  await expect(page).toHaveURL("/library");
});

test("another user signing in on the same tab never sees the last user's likes (#107)", async ({ page }) => {
  const search = async () => {
    await page.getByRole("tab", { name: "YouTube Music" }).click();
    await page.getByRole("searchbox", { name: "ค้นหาเพลง ศิลปิน หรืออัลบั้ม" }).fill("lemon");
    return page.getByRole("button", { name: "ถูกใจ Lemon" });
  };
  await setFakeDiscordUser(kai, []);
  await signInThroughPopup(page, "Kai");
  await page.goto("/search");
  const heart = await search();
  if ((await heart.getAttribute("aria-pressed")) !== "true") await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "true");

  // Same tab, no reload: sign out, then Wen (who has not liked Lemon) signs in.
  await page.getByRole("button", { name: "ออกจากระบบ" }).click();
  await setFakeDiscordUser(wen, []);
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "เข้าสู่ระบบด้วย Discord" }).click();
  await (await popup).waitForEvent("close");
  await expect(page.getByTestId("account-name")).toHaveText("Wen");
  await expect(await search()).toHaveAttribute("aria-pressed", "false");
});

test("without Spotify the import says Spotify is coming soon and refuses a Spotify link (#157)", async ({ page }) => {
  await page.route("**/api/sources", (route) => route.fulfill({ json: { spotify: false, soundcloud: false } }));
  await setFakeDiscordUser({ id: "460000000000000157", username: "soon157", globalName: "Soon" }, []);
  await signInThroughPopup(page, "Soon");
  await page.goto("/library");
  await page.getByRole("button", { name: "นำเข้า Playlist" }).click();
  const dialog = page.getByRole("dialog", { name: "นำเข้า Playlist" });
  await expect(dialog).toContainText("Spotify รองรับเร็ว ๆ นี้");
  await dialog.getByRole("textbox").first().fill("https://open.spotify.com/playlist/PLX");
  await dialog
    .getByRole("button", { name: /โหลด|ดูตัวอย่าง|ถัดไป/ })
    .first()
    .click();
  await expect(dialog.getByText("Spotify รองรับเร็ว ๆ นี้ ตอนนี้ใช้ได้เฉพาะ Playlist ของ YouTube")).toBeVisible();
});
