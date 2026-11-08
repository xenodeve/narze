import { setFakeDiscordUser } from "@narze/fake-discord";
import { localSupabase } from "@narze/fake-discord/supabase-local";
import { Channels, DEFAULT_REDIS_URL, RedisKeys } from "@narze/shared";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import Redis from "ioredis";
import { signInThroughPopup } from "./support";

const dev = { id: "490000000000000410", username: "devdash110", globalName: "Devi" };
const fan = { id: "490000000000000411", username: "fandash110", globalName: "Fanny" };
const redis = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);

const sample = (at: number, cpu: number) => ({
  at,
  windowMs: 5000,
  online: true,
  pingMs: 42,
  uptimeMs: 3_600_000,
  guilds: 7,
  activePlayers: 2,
  cpuPercent: cpu,
  memory: { usedBytes: 4 * 1024 ** 3, totalBytes: 16 * 1024 ** 3 },
  caches: [{ name: "youtube-facts", items: 12, bytes: 2048 }],
});

test.beforeAll(async () => {
  await redis.del(RedisKeys.botStatsRing, RedisKeys.botLogRing);
  for (let i = 0; i < 3; i++)
    await redis.lpush(RedisKeys.botStatsRing, JSON.stringify(sample(Date.now() - (2 - i) * 5000, 10 + i)));
  await redis.lpush(
    RedisKeys.botLogRing,
    JSON.stringify({ at: 1, level: "info", text: "[bot] logged in as Narze" }),
    JSON.stringify({ at: 2, level: "warn", text: "\u001b[33m[bot] lavalink slow\u001b[39m" }),
  );
});

test.afterAll(async () => {
  await redis.del(RedisKeys.botStatsRing, RedisKeys.botLogRing);
  await redis.quit();
});

test("an admin sees stats and the live log (#110, AC5)", async ({ page }) => {
  await setFakeDiscordUser(dev, []);
  await signInThroughPopup(page, "Devi");
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "ภาพรวมบอท", level: 1 })).toBeVisible();
  const cards = page.getByTestId("admin-card");
  await expect(cards.filter({ hasText: "เซิร์ฟเวอร์" })).toContainText("7");
  await expect(cards.filter({ hasText: "กำลังเล่น" })).toContainText("2");
  await expect(page.getByText("ทุก 5 วินาที", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("meter", { name: "CPU" })).toBeVisible();
  await expect(page.getByRole("row", { name: /youtube-facts/ })).toContainText("12");

  await page.getByRole("link", { name: "Log สด" }).click();
  const log = page.getByTestId("log-line");
  await expect(log).toHaveText([/logged in as Narze/, /lavalink slow/]);
  // ANSI colour codes are drawn, not shown as text.
  await expect(log.nth(1)).not.toContainText("[33m");
  await redis.publish(Channels.botLogs, JSON.stringify({ at: 3, level: "error", text: "[bot] live failure" }));
  await expect(log).toHaveCount(3);
  await page.getByRole("radio", { name: "warn" }).check();
  await expect(log).toHaveText([/lavalink slow/]);
});

test("a listener is refused: sent home, and the Backend says no (#110, AC5)", async ({ page }) => {
  await setFakeDiscordUser(fan, []);
  await signInThroughPopup(page, "Fanny");
  await page.goto("/admin");
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("link", { name: "แอดมิน" })).toHaveCount(0);
});

test("only a Developer manages the whitelist (#110, AC2)", async ({ page }) => {
  await setFakeDiscordUser(dev, []);
  await signInThroughPopup(page, "Devi");
  await page.goto("/admin/settings");
  await expect(page.getByTestId("whitelist-row").filter({ hasText: dev.id })).toContainText("developer");
  await page.getByLabel("Discord ID").fill(fan.id);
  await page.getByRole("button", { name: "เพิ่ม" }).click();
  await expect(page.getByTestId("whitelist-row").filter({ hasText: fan.id })).toContainText("admin");
  await page.getByRole("button", { name: `ลบ ${fan.id}` }).click();
  await expect(page.getByTestId("whitelist-row").filter({ hasText: fan.id })).toHaveCount(0);
});

test("an Admin who is not a Developer is sent away from the whitelist page (#133)", async ({ page }) => {
  const supabase = localSupabase();
  const db = createClient(supabase.url, supabase.secretKey, { auth: { persistSession: false } });
  await db.from("admin_whitelist").upsert({ discord_id: fan.id, role: "admin", added_by: dev.id });
  try {
    await setFakeDiscordUser(fan, []);
    await signInThroughPopup(page, "Fanny");
    // The admin area is theirs; the Developer-only page is not.
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "ภาพรวมบอท", level: 1 })).toBeVisible();
    await page.goto("/admin/settings");
    await expect(page).toHaveURL("/");
    await expect(page.getByTestId("whitelist-row")).toHaveCount(0);
  } finally {
    await db.from("admin_whitelist").delete().eq("discord_id", fan.id);
  }
});
