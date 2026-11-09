import { setFakeDiscordUser } from "@narze/fake-discord";
import { DEFAULT_REDIS_URL, RedisKeys } from "@narze/shared";
import { expect, test } from "@playwright/test";
import Redis from "ioredis";
import { signInThroughPopup, stubDiscordCdn } from "./support";

const G_ICON = "945000000000000001";
const G_PLAIN = "945000000000000002";
const G_BROKEN = "945000000000000003";
const nina = { id: "495000000000000001", username: "nina", globalName: "Nina" };
const redis = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);

test.beforeAll(async () => {
  await redis.sadd(RedisKeys.botGuilds, G_ICON, G_PLAIN, G_BROKEN);
});

test.afterAll(async () => {
  await redis.srem(RedisKeys.botGuilds, G_ICON, G_PLAIN, G_BROKEN);
  await redis.quit();
});

test("the sidebar shows each server's Discord icon in a rounded square; no icon, a monogram (#166)", async ({
  page,
}) => {
  // One icon the CDN cannot serve: its row falls back to the monogram, not an empty gap.
  await stubDiscordCdn(page, [G_BROKEN]);
  await setFakeDiscordUser(nina, [
    { id: G_ICON, name: "Picture Club", icon: "a1b2c3", owner: false },
    { id: G_PLAIN, name: "Zen room", icon: null, owner: false },
    { id: G_BROKEN, name: "Gone pic", icon: "dead00", owner: false },
  ]);
  await signInThroughPopup(page, "Nina");
  await page.goto("/search");

  const icon = page.locator(`[data-testid="nav-guild-icon"][data-guild-id="${G_ICON}"]`);
  await expect(icon).toHaveAttribute("src", `https://cdn.discordapp.com/icons/${G_ICON}/a1b2c3.png?size=96`);
  const box = await icon.boundingBox();
  expect(box?.width).toBe(20);
  expect(box?.height).toBe(20);
  // A square with slightly rounded corners, not a circle.
  await expect(icon).toHaveCSS("border-radius", "5px");

  const plain = page.locator(`[data-testid="nav-monogram"][data-guild-id="${G_PLAIN}"]`);
  await expect(plain).toHaveText("Z");
  await expect(plain).toHaveCSS("border-radius", "5px");
  await expect(page.locator(`[data-testid="nav-guild-icon"][data-guild-id="${G_PLAIN}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-testid="nav-monogram"][data-guild-id="${G_BROKEN}"]`)).toHaveText("G");
  await expect(page.locator(`[data-testid="nav-guild-icon"][data-guild-id="${G_BROKEN}"]`)).toHaveCount(0);
  // The Bot Avatar no longer stands in for the server here.
  await expect(page.getByTestId("nav-avatar")).toHaveCount(0);
});

test("moving between pages keeps the document and the shell; only the content changes (#168)", async ({ page }) => {
  await stubDiscordCdn(page);
  await setFakeDiscordUser(nina, [{ id: G_ICON, name: "Picture Club", icon: "a1b2c3", owner: false }]);
  await signInThroughPopup(page, "Nina");
  await page.goto(`/guilds/${G_ICON}`);
  const sidebar = page.getByRole("navigation", { name: "เซิร์ฟเวอร์ของคุณ" });
  await expect(sidebar.getByRole("button", { name: /Picture Club/ })).toBeVisible();

  // Marks a full document load would wipe, and a remounted sidebar would not carry.
  await page.evaluate(() => {
    (window as unknown as { __kept: number }).__kept = 1;
    (document.querySelector('nav[aria-label="เซิร์ฟเวอร์ของคุณ"]') as unknown as { __kept: number }).__kept = 1;
  });
  let guildFetches = 0;
  page.on("request", (r) => r.url().includes("/api/me/guilds") && r.method() === "GET" && guildFetches++);
  const kept = () =>
    page.evaluate(() => ({
      document: (window as unknown as { __kept?: number }).__kept === 1,
      sidebar:
        (document.querySelector('nav[aria-label="เซิร์ฟเวอร์ของคุณ"]') as unknown as { __kept?: number } | null)?.__kept ===
        1,
    }));

  await sidebar.getByRole("button", { name: "ค้นหา" }).click();
  await expect(page).toHaveURL("/search");
  expect(await kept()).toEqual({ document: true, sidebar: true });

  await sidebar.getByRole("button", { name: /Picture Club/ }).click();
  await expect(page).toHaveURL(`/guilds/${G_ICON}`);
  await page.getByRole("link", { name: "ตั้งค่าเซิร์ฟเวอร์" }).click();
  await expect(page).toHaveURL(`/guilds/${G_ICON}/settings`);
  expect(await kept()).toEqual({ document: true, sidebar: true });
  expect(guildFetches).toBe(0);

  // The brand and the home server list are links too, not document loads.
  await page.getByRole("link", { name: "NARZE · V7" }).click();
  await expect(page).toHaveURL("/");
  await page.getByRole("link", { name: "Picture Club", exact: true }).click();
  await expect(page).toHaveURL(`/guilds/${G_ICON}`);
  expect((await kept()).document).toBe(true);
});

test("the sidebar highlight follows the URL, Back included; on a phone a pick folds the menu (#168 review)", async ({
  page,
}) => {
  await stubDiscordCdn(page);
  await setFakeDiscordUser(nina, [
    { id: G_ICON, name: "Picture Club", icon: "a1b2c3", owner: false },
    { id: G_PLAIN, name: "Zen room", icon: null, owner: false },
  ]);
  await signInThroughPopup(page, "Nina");
  await page.goto(`/guilds/${G_PLAIN}`);
  const sidebar = page.getByRole("navigation", { name: "เซิร์ฟเวอร์ของคุณ" });
  const zen = sidebar.getByRole("button", { name: /Zen room/ });
  await expect(zen).toHaveAttribute("aria-current", "true");

  await sidebar.getByRole("button", { name: "ค้นหา" }).click();
  await expect(page).toHaveURL("/search");
  await page.goBack();
  await expect(page).toHaveURL(`/guilds/${G_PLAIN}`);
  // The shell stayed mounted, and still shows where you are.
  await expect(zen).toHaveAttribute("aria-current", "true");
  await expect(sidebar.getByRole("button", { name: "ค้นหา" })).not.toHaveAttribute("data-active", "");

  // On a phone the menu starts folded; open it, pick a server, and it folds again.
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`/guilds/${G_PLAIN}`);
  // A folded <details> hides its nav from the accessibility tree, so find it by markup.
  const menu = page.locator('details:has(nav[aria-label="เซิร์ฟเวอร์ของคุณ"])');
  await expect(menu).not.toHaveAttribute("open", "");
  await menu.locator("summary").click();
  await expect(menu).toHaveAttribute("open", "");
  await sidebar.getByRole("button", { name: /Picture Club/ }).click();
  await expect(page).toHaveURL(`/guilds/${G_ICON}`);
  await expect(menu).not.toHaveAttribute("open", "");
});
