import { setFakeDiscordUser } from "@narze/fake-discord";
import {
  Channels,
  DEFAULT_REDIS_URL,
  type GuildEvent,
  GuildEventTypes,
  type PlayerCommand,
  PlayerCommandSchema,
  type PlayerState,
  RedisKeys,
  type Track,
} from "@narze/shared";
import { moveTrack } from "@narze/shared/queue";
import { expect, type Page, test } from "@playwright/test";
import Redis from "ioredis";
import { signInThroughPopup } from "./support";

const GUILD = "934000000000000001";
const owner = { id: "440000000000000001", username: "quinn", globalName: "Quinn" };
const url = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
/** A fresh epoch per worker: Playwright reloads this file after a failure, restarting the revisions. */
const RUN = Date.now();
const redis = new Redis(url);
const bot = new Redis(url);

const track = (title: string): Track => ({
  uri: `https://music.youtube.com/watch?v=${title.toLowerCase()}`,
  source: "youtubemusic",
  title,
  author: `${title} Artist`,
  durationMs: 180_000,
  artworkUrl: null,
  requester: { id: owner.id, name: "Quinn", avatarUrl: null },
});

/** The test plays the Bot: a real queue, every edit applied in order and published with a new revision. */
const model = { current: track("Lemon"), queue: [] as Track[], revision: 2000 };

async function publish(): Promise<void> {
  const state: PlayerState = {
    guildId: GUILD,
    current: model.current,
    positionMs: 0,
    syncedAt: Date.now(),
    paused: false,
    volume: 15,
    loop: "off",
    twentyFourSeven: false,
    queue: model.queue,
    revision: ++model.revision,
    epoch: `queue-e2e-${RUN}`,
    lastSeekAt: null,
    voiceChannelId: "93",
  };
  const event: GuildEvent = {
    type: GuildEventTypes.playerState,
    guildId: GUILD,
    revision: state.revision,
    sequence: state.revision,
    ts: Date.now(),
    data: state,
  };
  await redis.set(RedisKeys.playerState(GUILD), JSON.stringify(state));
  await redis.publish(Channels.guildEvents, JSON.stringify(event));
}

function apply(cmd: PlayerCommand): boolean {
  const c = cmd.command;
  // Like the Bot: an edit naming a track that is no longer at that index is refused (#102).
  if ("uri" in c && "index" in c && model.queue[c.index]?.uri !== c.uri) return false;
  if (c.action === "move" && model.queue[c.from]?.uri !== c.uri) return false;
  if (c.action === "play") model.queue = c.next ? [track(c.query), ...model.queue] : [...model.queue, track(c.query)];
  else if (c.action === "move") {
    const next = moveTrack(model.queue, c.from, c.to);
    if (!next) return false;
    model.queue = next;
  } else if (c.action === "remove") model.queue = model.queue.filter((_, i) => i !== c.index);
  else if (c.action === "clear") model.queue = [];
  else return false;
  return true;
}

const rows = (page: Page) => page.getByTestId("queue-row").locator("[class*=trackTitle]");

test.beforeAll(async () => {
  await redis.sadd(RedisKeys.botGuilds, GUILD);
  await redis.set(
    RedisKeys.playerSummary(GUILD),
    JSON.stringify({ playing: true, queueLength: 0, voiceChannelId: "93" }),
  );
  await publish();
  await bot.subscribe(Channels.botCommands);
  // One command at a time, like the Bot: concurrent edits from two tabs are serialised here.
  let chain = Promise.resolve();
  bot.on("message", (_c, raw) => {
    const cmd = PlayerCommandSchema.parse(JSON.parse(raw));
    chain = chain.then(async () => {
      const ok = apply(cmd);
      if (ok) await publish();
      await redis.publish(
        Channels.botCommandResults,
        JSON.stringify({ id: cmd.id, ok, error: ok ? undefined : "invalid-index" }),
      );
    });
  });
});

test.afterAll(async () => {
  await redis.srem(RedisKeys.botGuilds, GUILD);
  await redis.del(RedisKeys.playerState(GUILD), RedisKeys.playerSummary(GUILD));
  await bot.quit();
  await redis.quit();
});

test("add, reorder by keyboard, remove and clear show the same queue in two tabs", async ({ page, context }) => {
  await setFakeDiscordUser(owner, [{ id: GUILD, name: "Queue Club", icon: null, owner: true }]);
  await signInThroughPopup(page, "Quinn");
  await page.goto(`/guilds/${GUILD}`);
  const other = await context.newPage();
  await other.goto(`/guilds/${GUILD}`);

  for (const title of ["Idol", "Gurenge", "Pretender"]) {
    await page.getByLabel("ชื่อเพลงหรือลิงก์").fill(title);
    await page.getByRole("button", { name: "เพิ่มคิว" }).click();
    await expect(other.getByTestId("queue-row").last()).toContainText(title);
  }

  // Keyboard-only reorder, announced to screen readers.
  await page.getByRole("button", { name: /ย้าย Pretender/ }).focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("[aria-live=polite]").filter({ hasText: "ย้าย Pretender" })).toHaveText(
    "ย้าย Pretender ไปลำดับที่ 2",
  );
  await expect(rows(other)).toHaveText(["Idol", "Pretender", "Gurenge"]);

  await other.getByRole("button", { name: "ลบ Idol ออกจากคิว" }).click({ force: true });
  await expect(rows(page)).toHaveText(["Pretender", "Gurenge"]);

  await page.getByRole("button", { name: "ล้างคิว" }).click();
  await page.getByRole("dialog", { name: "ล้างคิวทั้งหมด?" }).getByRole("button", { name: "ล้างคิว" }).click();
  await expect(other.getByText("คิวว่าง")).toBeVisible();
  await expect(page.getByText("คิวว่าง")).toBeVisible();
});

test("two tabs reordering at the same time converge to the server's order", async ({ page, context }) => {
  model.queue = ["A1", "B2", "C3", "D4"].map(track);
  await publish();
  await setFakeDiscordUser(owner, [{ id: GUILD, name: "Queue Club", icon: null, owner: true }]);
  await signInThroughPopup(page, "Quinn");
  await page.goto(`/guilds/${GUILD}`);
  const other = await context.newPage();
  await other.goto(`/guilds/${GUILD}`);
  await expect(rows(other)).toHaveText(["A1", "B2", "C3", "D4"]);
  const base = model.revision;

  await Promise.all([
    (async () => {
      await page.getByRole("button", { name: /ย้าย D4/ }).focus();
      await page.keyboard.press("ArrowUp");
    })(),
    (async () => {
      await other.getByRole("button", { name: /ย้าย A1/ }).focus();
      await other.keyboard.press("ArrowDown");
    })(),
  ]);

  // Both moves applied (one revision each) before reading the server's order.
  await expect.poll(() => model.revision).toBe(base + 2);
  await expect(rows(page)).toHaveText(model.queue.map((t) => t.title));
  await expect(rows(other)).toHaveText(model.queue.map((t) => t.title));
});

test("dragging a row by its handle moves it, and a cancelled drag moves nothing", async ({ page }) => {
  model.queue = ["P1", "Q2", "R3"].map(track);
  await publish();
  await setFakeDiscordUser(owner, [{ id: GUILD, name: "Queue Club", icon: null, owner: true }]);
  await signInThroughPopup(page, "Quinn");
  await page.goto(`/guilds/${GUILD}`);
  await expect(rows(page)).toHaveText(["P1", "Q2", "R3"]);

  const handle = page.getByRole("button", { name: /ย้าย R3/ });
  const first = await page.getByTestId("queue-row").first().boundingBox();
  const box = await handle.boundingBox();
  if (!first || !box) throw new Error("no layout");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // Past the list's edge: the captured pointer still drives the drag.
  await page.mouse.move(box.x + box.width / 2, first.y - 40, { steps: 8 });
  await page.mouse.up();
  await expect(rows(page)).toHaveText(["R3", "P1", "Q2"]);
  expect(model.queue.map((t) => t.title)).toEqual(["R3", "P1", "Q2"]);

  // A pointer the browser cancels ends the drag in place.
  const before = model.revision;
  const q2 = page.getByRole("button", { name: /ย้าย Q2/ });
  const q2box = await q2.boundingBox();
  if (!q2box) throw new Error("no layout");
  await page.mouse.move(q2box.x + q2box.width / 2, q2box.y + q2box.height / 2);
  await page.mouse.down();
  await expect(page.locator("[data-dragging]")).toHaveCount(1);
  // Chromium's mouse is pointer 1; a real cancel comes from the browser, not the page.
  await q2.dispatchEvent("pointercancel", { pointerId: 1, isPrimary: true });
  await expect(page.locator("[data-dragging]")).toHaveCount(0);
  await page.mouse.move(q2box.x + q2box.width / 2, first.y - 40, { steps: 4 });
  await page.mouse.up();
  await expect(rows(page)).toHaveText(["R3", "P1", "Q2"]);
  expect(model.revision).toBe(before);
});
