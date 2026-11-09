import { setFakeDiscordUser } from "@narze/fake-discord";
import { DEFAULT_REDIS_URL, RedisKeys } from "@narze/shared";
import { expect, test } from "@playwright/test";
import Redis from "ioredis";
import { signInThroughPopup } from "./support";

const G_ICON = "945000000000000001";
const G_PLAIN = "945000000000000002";
const nina = { id: "495000000000000001", username: "nina", globalName: "Nina" };
const redis = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);
// A 1×1 PNG, so the test does not reach Discord's CDN.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

test.beforeAll(async () => {
  await redis.sadd(RedisKeys.botGuilds, G_ICON, G_PLAIN);
});

test.afterAll(async () => {
  await redis.srem(RedisKeys.botGuilds, G_ICON, G_PLAIN);
  await redis.quit();
});

test("the sidebar shows each server's Discord icon in a rounded square; no icon, a monogram (#166)", async ({
  page,
}) => {
  await page.route("https://cdn.discordapp.com/**", (route) => route.fulfill({ contentType: "image/png", body: PNG }));
  await setFakeDiscordUser(nina, [
    { id: G_ICON, name: "Picture Club", icon: "a1b2c3", owner: false },
    { id: G_PLAIN, name: "Zen room", icon: null, owner: false },
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
  // The Bot Avatar no longer stands in for the server here.
  await expect(page.getByTestId("nav-avatar")).toHaveCount(0);
});
