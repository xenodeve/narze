import { setFakeDiscordUser } from "@narze/fake-discord";
import { DEFAULT_REDIS_URL, RedisKeys } from "@narze/shared";
import { expect, test } from "@playwright/test";
import Redis from "ioredis";
import { signInThroughPopup, stubDiscordCdn } from "./support";

const G_ONE = "947000000000000001";
const G_TWO = "947000000000000002";
const pia = { id: "497000000000000001", username: "pia", globalName: "Pia" };
const redis = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);
const MENU = 'nav[aria-label="เซิร์ฟเวอร์ของคุณ"] > *';

test.beforeAll(async () => {
  await redis.sadd(RedisKeys.botGuilds, G_ONE, G_TWO);
});

test.afterAll(async () => {
  await redis.srem(RedisKeys.botGuilds, G_ONE, G_TWO);
  await redis.quit();
});

test.beforeEach(async ({ page }) => {
  await stubDiscordCdn(page);
  await setFakeDiscordUser(pia, [
    { id: G_ONE, name: "First Floor", icon: "f1", owner: false },
    { id: G_TWO, name: "Second Floor", icon: "f2", owner: false },
  ]);
  await signInThroughPopup(page, "Pia");
});

test("home sits in the shell; each page enters with DESIGN.md's page motion (#172)", async ({ page }) => {
  // Signed in, home has the sidebar like every other page.
  const sidebar = page.getByRole("navigation", { name: "เซิร์ฟเวอร์ของคุณ" });
  await expect(sidebar.getByRole("button", { name: /First Floor/ })).toBeVisible();
  await sidebar.getByRole("button", { name: "ค้นหา" }).click();
  await expect(page).toHaveURL("/search");
  await expect(page.getByTestId("page")).toHaveCSS("animation-name", /page/);
});

test("moving between two servers replays the page motion too, not only a new top-level section (#172 review)", async ({
  page,
}) => {
  await page.goto(`/guilds/${G_ONE}`);
  const sidebar = page.getByRole("navigation", { name: "เซิร์ฟเวอร์ของคุณ" });
  await expect(page.getByTestId("page")).toBeVisible();
  await page.evaluate(() => {
    (document.querySelector('[data-testid="page"]') as unknown as { __old: number }).__old = 1;
  });
  await sidebar.getByRole("button", { name: /Second Floor/ }).click();
  await expect(page).toHaveURL(`/guilds/${G_TWO}`);
  // A fresh wrapper: its entrance animation runs again.
  await expect
    .poll(() =>
      page.evaluate(() => (document.querySelector('[data-testid="page"]') as unknown as { __old?: number })?.__old),
    )
    .toBeUndefined();
  await expect(page.getByTestId("page")).toHaveCSS("animation-name", /page/);
});

test("signed out, home uses the full width, not the sidebar's column (#172 review)", async ({ browser }) => {
  const fresh = await (await browser.newContext()).newPage();
  await fresh.goto("/");
  const title = fresh.getByRole("heading", { level: 1 });
  await expect(title).toBeVisible();
  const box = await fresh.locator("main").boundingBox();
  // Wider than the 240px sidebar column it used to fall into.
  expect(box?.width ?? 0).toBeGreaterThan(600);
  await fresh.context().close();
});

test("the menu stays mounted after its own pick, and still re-marks after Back (#172)", async ({ page }) => {
  await page.goto(`/guilds/${G_ONE}`);
  const sidebar = page.getByRole("navigation", { name: "เซิร์ฟเวอร์ของคุณ" });
  await expect(sidebar.getByRole("button", { name: /First Floor/ })).toHaveAttribute("aria-current", "true");
  await page.evaluate((sel) => {
    (document.querySelector(sel) as unknown as { __kept: number }).__kept = 1;
  }, MENU);
  const kept = () =>
    page.evaluate((sel) => (document.querySelector(sel) as unknown as { __kept?: number })?.__kept === 1, MENU);

  await sidebar.getByRole("button", { name: /Second Floor/ }).click();
  await expect(page).toHaveURL(`/guilds/${G_TWO}`);
  // The marker glides on the same menu: no remount mid-glide.
  expect(await kept()).toBe(true);
  await expect(sidebar.getByRole("button", { name: /Second Floor/ })).toHaveAttribute("aria-current", "true");

  await page.goBack();
  await expect(page).toHaveURL(`/guilds/${G_ONE}`);
  await expect(sidebar.getByRole("button", { name: /First Floor/ })).toHaveAttribute("aria-current", "true");
});

test("while the player loads, the skeleton already has the page's two columns (#172)", async ({ page }) => {
  let release: () => void = () => {};
  const held = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/api/guilds/*/player", async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(`/guilds/${G_ONE}`);
  const skeleton = page.getByTestId("player-skeleton");
  await expect(skeleton).toBeVisible();
  await expect(skeleton.getByTestId("skeleton-stage")).toBeVisible();
  await expect(skeleton.getByTestId("skeleton-side")).toBeVisible();
  // Measure at rest: the page enters scaled from 0.985 about its centre, so a skeleton that shows
  // within those 260 ms sits up to ~7 px off its resting edge (#180).
  await page.getByTestId("page").evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const stage = await skeleton.getByTestId("skeleton-stage").boundingBox();
  release();
  await expect(skeleton).toHaveCount(0);
  // The real stage takes the skeleton's place: same left edge and width.
  const real = await page.locator("main section").first().boundingBox();
  expect(Math.abs((real?.x ?? 0) - (stage?.x ?? 0))).toBeLessThan(2);
  expect(Math.abs((real?.width ?? 0) - (stage?.width ?? 0))).toBeLessThan(2);
});
