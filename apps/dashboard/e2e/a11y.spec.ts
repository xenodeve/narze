import AxeBuilder from "@axe-core/playwright";
import { setFakeDiscordUser } from "@narze/fake-discord";
import { DEFAULT_REDIS_URL, RedisKeys } from "@narze/shared";
import { expect, type Page, test } from "@playwright/test";
import Redis from "ioredis";
import { signInThroughPopup } from "./support";

/**
 * #114 hardening: every route has no axe violation (WCAG 2.2 A/AA), and no route scrolls sideways at
 * 390 / 1024 / 1440 px in light and dark. Signed in as the Developer from NARZE_DEVELOPER_IDS, so the
 * admin pages are reachable too.
 */
const dev = { id: "490000000000000410", username: "devdash110", globalName: "Devi" };
const G = "934000000000000001";
const redis = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);

const ROUTES = [
  "/",
  "/search",
  "/library",
  "/sessions",
  "/artist/a1",
  "/album/al2",
  `/guilds/${G}`,
  `/guilds/${G}/settings`,
  "/admin",
  "/admin/logs",
  "/admin/settings",
];

test.beforeAll(async () => {
  await redis.sadd(RedisKeys.botGuilds, G);
});
test.afterAll(async () => {
  await redis.srem(RedisKeys.botGuilds, G);
  await redis.quit();
});

async function signedIn(page: Page): Promise<void> {
  await setFakeDiscordUser(dev, [{ id: G, name: "A11y Room", icon: null, owner: true }]);
  await signInThroughPopup(page, "Devi");
}

/** Waits for the page to settle: no "loading" placeholders left. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
}

for (const scheme of ["light", "dark"] as const) {
  test(`axe finds no violations on any route (${scheme}) (#114 AC2)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await signedIn(page);
    const found: string[] = [];
    for (const route of ROUTES) {
      await page.goto(route);
      await settle(page);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        // Supplied canvases draw no text; their containers are aria-hidden.
        .exclude("canvas")
        .analyze();
      for (const v of result.violations) {
        found.push(
          `${route} ${v.id} (${v.impact}): ${v.nodes
            .map((n) => n.target.join(" "))
            .slice(0, 3)
            .join(" | ")}`,
        );
      }
    }
    expect(found).toEqual([]);
  });
}

test("no route scrolls sideways at 390, 1024 or 1440 px, light or dark (#114)", async ({ page }) => {
  test.setTimeout(240_000);
  await signedIn(page);
  const wide: string[] = [];
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of [390, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ROUTES) {
        await page.goto(route);
        await settle(page);
        const over = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (over > 0) wide.push(`${route} @${width} ${scheme}: +${over}px`);
      }
    }
  }
  expect(wide).toEqual([]);
});

test("reduced motion and WebGL off still give complete pages (#114)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signedIn(page);
  for (const route of [`/guilds/${G}?fx=0`, "/?fx=0", "/admin?fx=0"]) {
    await page.goto(route);
    await settle(page);
    await expect(page.locator("main, [role=main]").first()).toBeVisible();
    // The Aurora, if any, is the flat wash: no WebGL canvas runs.
    await expect(page.locator('[data-fx="aurora"]')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("keyboard only: Tab reaches playback and queue controls, they show focus, and Enter/Space act (#114)", async ({
  page,
}) => {
  const { Channels, PlayerCommandSchema } = await import("@narze/shared");
  const bot = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);
  const heard: string[] = [];
  await bot.subscribe(Channels.botCommands);
  bot.on("message", (_c, raw) => {
    const cmd = PlayerCommandSchema.parse(JSON.parse(raw));
    heard.push(cmd.command.action);
    void redis.publish(Channels.botCommandResults, JSON.stringify({ id: cmd.id, ok: true }));
  });
  const track = (title: string) => ({
    uri: `https://music.youtube.com/watch?v=${title}`,
    source: "youtubemusic",
    title,
    author: "Kenshi Yonezu",
    durationMs: 200_000,
    artworkUrl: null,
    requester: { id: dev.id, name: "Devi", avatarUrl: null },
  });
  await redis.set(
    RedisKeys.playerState(G),
    JSON.stringify({
      guildId: G,
      current: track("Lemon"),
      positionMs: 1000,
      syncedAt: Date.now(),
      paused: false,
      volume: 15,
      loop: "off",
      twentyFourSeven: false,
      queue: [track("Idol")],
      revision: 9000,
      epoch: "a11y-e2e",
      lastSeekAt: null,
      voiceChannelId: "94",
    }),
  );
  await redis.set(RedisKeys.playerSummary(G), JSON.stringify({ playing: true, queueLength: 1, voiceChannelId: "94" }));
  await signedIn(page);
  await page.goto(`/guilds/${G}`);
  await expect(page.getByTestId("toggle-pause")).toBeVisible();

  /** Tabs forward until `target` has focus (at most 80 stops), then checks a focus ring is drawn. */
  const tabTo = async (target: ReturnType<Page["locator"]>) => {
    for (let i = 0; i < 80; i++) {
      if (await target.evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press("Tab");
    }
    await expect(target).toBeFocused();
    const ring = await target.evaluate((el) => {
      const style = getComputedStyle(el);
      return style.outlineStyle !== "none" || style.boxShadow !== "none";
    });
    expect(ring).toBe(true);
  };
  await tabTo(page.getByTestId("toggle-pause"));
  await page.keyboard.press("Space");
  await expect.poll(() => heard).toContain("pause");
  await tabTo(page.getByRole("button", { name: "เล่น Idol ตอนนี้" }));
  await page.keyboard.press("Enter");
  await expect.poll(() => heard).toContain("playNow");
  await bot.quit();
  await redis.del(RedisKeys.playerState(G), RedisKeys.playerSummary(G));
});
