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
  const stage = await skeleton.getByTestId("skeleton-stage").boundingBox();
  release();
  await expect(skeleton).toHaveCount(0);
  // The real stage takes the skeleton's place: same left edge and width.
  const real = await page.locator("main section").first().boundingBox();
  expect(Math.abs((real?.x ?? 0) - (stage?.x ?? 0))).toBeLessThan(2);
  expect(Math.abs((real?.width ?? 0) - (stage?.width ?? 0))).toBeLessThan(2);
});
