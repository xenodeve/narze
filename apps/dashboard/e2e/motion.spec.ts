import { setFakeDiscordUser } from "@narze/fake-discord";
import { Channels, DEFAULT_REDIS_URL, GuildEventTypes, type PlayerState, RedisKeys, type Track } from "@narze/shared";
import { expect, type Page, test } from "@playwright/test";
import Redis from "ioredis";
import { signInThroughPopup } from "./support";

const G_PLAY = "948000000000000001";
const G_IDLE = "948000000000000002";
const rae = { id: "498000000000000001", username: "rae", globalName: "Rae" };
const redis = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);
const RUN = Date.now();

const track = (title: string): Track => ({
  uri: `https://music.youtube.com/watch?v=${title.toLowerCase()}`,
  source: "youtubemusic",
  title,
  author: `${title} Artist`,
  durationMs: 180_000,
  artworkUrl: null,
  requester: { id: rae.id, name: "Rae", avatarUrl: null },
});

async function playing(): Promise<void> {
  const state: PlayerState = {
    guildId: G_PLAY,
    current: track("Lemon"),
    positionMs: 0,
    syncedAt: Date.now(),
    paused: false,
    volume: 15,
    loop: "off",
    twentyFourSeven: false,
    queue: [track("Idol"), track("Gurenge")],
    revision: 1,
    epoch: `motion-e2e-${RUN}`,
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

/** Running animations on the elements a selector matches (Web Animations: CSS and motion/react alike). */
const running = (page: Page, selector: string) =>
  page.evaluate((sel) => [...document.querySelectorAll(sel)].flatMap((e) => e.getAnimations()).length, selector);

test.beforeAll(async () => {
  await redis.sadd(RedisKeys.botGuilds, G_PLAY, G_IDLE);
  await redis.hset(RedisKeys.voiceStates(G_PLAY), rae.id, "93");
  await redis.del(RedisKeys.playerState(G_IDLE), RedisKeys.playerSummary(G_IDLE));
  await playing();
});

test.afterAll(async () => {
  await redis.srem(RedisKeys.botGuilds, G_PLAY, G_IDLE);
  await redis.del(RedisKeys.playerState(G_PLAY), RedisKeys.voiceStates(G_PLAY));
  await redis.quit();
});

test.beforeEach(async ({ page }) => {
  await setFakeDiscordUser(rae, [
    { id: G_PLAY, name: "Play Room", icon: null, owner: true },
    { id: G_IDLE, name: "Idle Room", icon: null, owner: false },
  ]);
  await signInThroughPopup(page, "Rae");
});

test("tabs keep the search and do not replay the queue's entrance; a dialog fades out, not cut (#174)", async ({
  page,
}) => {
  await page.goto(`/guilds/${G_PLAY}`);
  await expect(page.getByTestId("queue-row")).toHaveCount(2);
  await page.getByRole("tab", { name: "ค้นหา" }).click();
  const box = page.getByRole("tabpanel").getByRole("searchbox", { name: "ค้นหาเพลง ศิลปิน หรืออัลบั้ม" });
  await box.fill("yoasobi");
  await page.getByRole("tab", { name: "คิว" }).click();
  await page.waitForTimeout(50);
  // Coming back to the queue does not re-run every row's entrance.
  expect(await running(page, '[data-testid="queue-row"]')).toBe(0);
  await page.getByRole("tab", { name: "ค้นหา" }).click();
  await expect(box).toHaveValue("yoasobi");

  await page.getByRole("tab", { name: "คิว" }).click();
  await page.getByRole("button", { name: "ล้างคิว" }).click();
  const confirm = page.getByRole("dialog", { name: "ล้างคิวทั้งหมด?" });
  await expect(confirm).toBeVisible();
  await page.waitForTimeout(300);
  await confirm.getByRole("button", { name: "ยกเลิก" }).click();
  // Still on screen, fading: the close is animated.
  const leaving = await page.evaluate(() => {
    const d = [...document.querySelectorAll("dialog")].find((x) => x.textContent?.includes("ล้างคิวทั้งหมด"));
    return d ? getComputedStyle(d).display !== "none" && Number(getComputedStyle(d).opacity) < 1 : false;
  });
  expect(leaving).toBe(true);
  await expect(confirm).toBeHidden();
});

test("an idle stage enters with the phase motion; a library toast floats and leaves on its own (#174)", async ({
  page,
}) => {
  await page.goto(`/guilds/${G_IDLE}`);
  const idle = page.getByRole("heading", { name: "ยังไม่มีเพลงเล่นอยู่" }).locator("..");
  await expect(idle).toHaveCSS("animation-name", /phase/);

  await page.goto("/library");
  await page.getByRole("button", { name: "สร้าง Playlist" }).click();
  const create = page.getByRole("dialog", { name: "สร้าง Playlist" });
  await create.getByLabel("ชื่อ").fill(`Toast ${RUN}`);
  await create.getByRole("button", { name: "สร้าง" }).click();
  await page.getByRole("link", { name: new RegExp(`Toast ${RUN}`) }).click();
  await page.getByRole("button", { name: "เปลี่ยนชื่อ" }).click();
  await page.getByLabel("ชื่อ Playlist").fill(`Toast ${RUN} 2`);
  await page.getByRole("button", { name: "บันทึกชื่อ" }).click();
  const toast = page
    .getByRole("status")
    .filter({ hasText: /\S/ })
    .filter({ hasNot: page.locator("[aria-busy]") })
    .last();
  await expect(toast).toBeVisible();
  // Floats above the page instead of pushing the tracks down.
  const position = await toast.evaluate((el) => getComputedStyle(el.closest("[aria-live]") ?? el).position);
  expect(position).toBe("fixed");
  // And leaves by itself.
  await expect(toast).toBeHidden({ timeout: 5000 });
  await page.getByRole("button", { name: "ลบ Playlist" }).click();
  await page.getByRole("dialog", { name: "ลบ Playlist นี้?" }).getByRole("button", { name: "ลบ" }).click();
});
