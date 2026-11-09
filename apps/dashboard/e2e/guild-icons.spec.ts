import { setFakeDiscordUser } from "@narze/fake-discord";
import { DEFAULT_REDIS_URL, RedisKeys } from "@narze/shared";
import { expect, test } from "@playwright/test";
import Redis from "ioredis";
import { guildIconUrl as icon, signInThroughPopup, stubDiscordCdn } from "./support";

const G_LOCKED = "946000000000000001";
const G_OPEN = "946000000000000002";
const omi = { id: "496000000000000001", username: "omi", globalName: "Omi" };
const redis = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);

test.beforeAll(async () => {
  await redis.sadd(RedisKeys.botGuilds, G_LOCKED, G_OPEN);
  // Omi is in voice in Open Lounge only: Locked Hall is listed first by Discord but cannot play.
  await redis.hset(RedisKeys.voiceStates(G_OPEN), omi.id, "97");
});

test.afterAll(async () => {
  await redis.srem(RedisKeys.botGuilds, G_LOCKED, G_OPEN);
  await redis.del(RedisKeys.voiceStates(G_OPEN));
  await redis.quit();
});

test("the home list and the server picker show each guild's icon; the picker lists playable servers first (#170)", async ({
  page,
}) => {
  await stubDiscordCdn(page);
  await setFakeDiscordUser(omi, [
    { id: G_LOCKED, name: "Locked Hall", icon: "aa11", owner: false },
    { id: G_OPEN, name: "Open Lounge", icon: "bb22", owner: false },
  ]);
  await signInThroughPopup(page, "Omi");

  // Home: the guild's own picture, not the Bot Avatar.
  const row = page.locator(`[data-testid="guild-row"][data-guild-id="${G_OPEN}"]`);
  await expect(row.getByTestId("guild-icon")).toHaveAttribute("src", icon(G_OPEN, "bb22"));
  await expect(page.getByTestId("guild-row").getByTestId("guild-avatar")).toHaveCount(0);

  // The picker: icons, playable first, Thai chips.
  await page.goto("/search");
  await page.getByRole("tab", { name: "YouTube Music" }).click();
  await page.getByRole("searchbox", { name: "ค้นหาเพลง ศิลปิน หรืออัลบั้ม" }).fill("lemon");
  await page.getByTestId("song-row").first().getByRole("button", { name: /^เล่น / }).click();
  const picker = page.getByRole("dialog", { name: "เลือกเซิร์ฟเวอร์" });
  const rows = picker.getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Open Lounge");
  await expect(rows.first()).toContainText("เล่นได้");
  await expect(rows.first().getByTestId("guild-icon")).toHaveAttribute("src", icon(G_OPEN, "bb22"));
  await expect(rows.last()).toContainText("Locked Hall");
  await expect(rows.last()).toContainText("ล็อก");
  await expect(rows.last().getByTestId("guild-icon")).toHaveAttribute("src", icon(G_LOCKED, "aa11"));
});
