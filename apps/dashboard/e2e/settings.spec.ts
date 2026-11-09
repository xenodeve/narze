import { setFakeDiscordUser } from "@narze/fake-discord";
import { localSupabase } from "@narze/fake-discord/supabase-local";
import {
  Channels,
  DEFAULT_REDIS_URL,
  type GuildEvent,
  GuildEventTypes,
  type PlayerState,
  RedisKeys,
} from "@narze/shared";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import Redis from "ioredis";
import { signInThroughPopup } from "./support";

const G_SET = "937000000000000001";
const owner = { id: "470000000000000001", username: "jun", globalName: "Jun" };
const member = { id: "470000000000000002", username: "kai", globalName: "Kai" };
const redis = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);
const { url, secretKey } = localSupabase();
const db = createClient(url, secretKey, { auth: { persistSession: false } });
let revision = 500;

async function publishTrack(title: string): Promise<void> {
  const state: PlayerState = {
    guildId: G_SET,
    current: {
      uri: `https://music.youtube.com/watch?v=${title}`,
      source: "youtubemusic",
      title,
      author: "Narze Test",
      durationMs: 200_000,
      artworkUrl: null,
      requester: { id: owner.id, name: "Jun", avatarUrl: null },
    },
    positionMs: 0,
    syncedAt: Date.now(),
    paused: false,
    volume: 15,
    loop: "off",
    twentyFourSeven: false,
    queue: [],
    revision: ++revision,
    epoch: "settings-e2e",
    lastSeekAt: null,
    voiceChannelId: "93",
  };
  const event: GuildEvent = {
    type: GuildEventTypes.playerState,
    guildId: G_SET,
    revision: state.revision,
    sequence: state.revision,
    ts: Date.now(),
    data: state,
  };
  await redis.set(RedisKeys.playerState(G_SET), JSON.stringify(state));
  await redis.publish(Channels.guildEvents, JSON.stringify(event));
}

test.beforeAll(async () => {
  await redis.sadd(RedisKeys.botGuilds, G_SET);
  await redis.del(RedisKeys.playerState(G_SET));
  await redis.set(
    RedisKeys.textChannels(G_SET),
    JSON.stringify([
      { id: "601", name: "general" },
      { id: "602", name: "music-room" },
    ]),
  );
  await db.from("guild_settings").delete().eq("guild_id", G_SET);
  await db
    .from("guild_settings")
    .insert({ guild_id: G_SET, guild_name: "Settings Club", owner_id: owner.id, avatar: {} });
});

test.afterAll(async () => {
  await redis.srem(RedisKeys.botGuilds, G_SET);
  await redis.del(RedisKeys.textChannels(G_SET), RedisKeys.playerState(G_SET));
  await db.from("guild_settings").delete().eq("guild_id", G_SET);
  await redis.quit();
});

test("the Bot Owner changes the Music Channel and the outfit; other tabs and every avatar follow (#106)", async ({
  page,
  context,
}) => {
  await setFakeDiscordUser(owner, [{ id: G_SET, name: "Settings Club", icon: null, owner: false }]);
  await signInThroughPopup(page, "Jun");
  await page.goto(`/guilds/${G_SET}/settings`);
  const other = await context.newPage();
  await other.goto(`/guilds/${G_SET}/settings`);

  await expect(page.getByText(owner.id)).toBeVisible();
  await page.getByRole("searchbox", { name: "ค้นหาห้องข้อความ" }).fill("mus");
  await page.getByRole("radio", { name: "# music-room" }).check();
  await page.getByRole("button", { name: "บันทึก Music Channel" }).click();
  await expect(page.getByText("บันทึกแล้ว")).toBeVisible();
  await expect(other.getByRole("radio", { name: "# music-room" })).toBeChecked({ timeout: 2000 });

  await page.getByLabel("หมวก").selectOption("crown");
  await page.getByLabel("ชนิด").selectOption("cat");
  // Guild setting toggles are the supplied SquishSwitch (DESIGN.md).
  await expect(page.getByRole("switch", { name: "หูฟัง" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "บันทึกชุด" }).click();
  await expect(other.getByTestId("outfit-preview")).toHaveAttribute("data-hat", "crown", { timeout: 2000 });

  await page.goto(`/guilds/${G_SET}`);
  await expect(page.getByTestId("now-avatar")).toHaveAttribute("data-hat", "crown");
  await expect(page.getByTestId("now-avatar")).toHaveAttribute("data-type", "cat");
});

test("a member sees the settings but cannot change them, and is told why (#106, spec #92)", async ({ page }) => {
  await setFakeDiscordUser(member, [{ id: G_SET, name: "Settings Club", icon: null, owner: false }]);
  await signInThroughPopup(page, "Kai");
  await page.goto(`/guilds/${G_SET}/settings`);
  await expect(page.getByText("เฉพาะเจ้าของเซิร์ฟเวอร์หรือ Bot Owner ที่เปลี่ยนการตั้งค่าได้")).toBeVisible();
  await expect(page.getByRole("button", { name: "บันทึกชุด" })).toBeDisabled();
});

test("now-playing notifications fire on a track change only while opted in and allowed (#106)", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["notifications"]);
  await page.addInitScript(() => {
    const shown: string[] = [];
    (window as unknown as { __shown: string[] }).__shown = shown;
    class FakeNotification {
      static permission = "granted";
      static requestPermission = async () => "granted";
      constructor(title: string, options?: { body?: string }) {
        shown.push(`${title}|${options?.body ?? ""}`);
      }
    }
    (window as unknown as { Notification: unknown }).Notification = FakeNotification;
  });
  const shown = () => page.evaluate(() => (window as unknown as { __shown: string[] }).__shown.length);
  await setFakeDiscordUser(owner, [{ id: G_SET, name: "Settings Club", icon: null, owner: false }]);
  await signInThroughPopup(page, "Jun");
  await page.goto(`/guilds/${G_SET}`);
  await publishTrack("First");
  await expect(page.getByTestId("now-title")).toHaveText("First");
  expect(await shown()).toBe(0);

  // A toggle keeps one name and reports its state through aria-pressed (the supplied BellToggle).
  const bell = page.getByRole("button", { name: "แจ้งเตือนฉัน" });
  await expect(bell).toHaveAttribute("aria-pressed", "false");
  await bell.click();
  await expect(bell).toHaveAttribute("aria-pressed", "true");
  await publishTrack("Second");
  await expect(page.getByTestId("now-title")).toHaveText("Second");
  await expect.poll(shown).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { __shown: string[] }).__shown[0])).toContain("Second");

  await bell.click();
  await expect(bell).toHaveAttribute("aria-pressed", "false");
  await publishTrack("Third");
  await expect(page.getByTestId("now-title")).toHaveText("Third");
  await page.waitForTimeout(300);
  expect(await shown()).toBe(1);
});
