import { setFakeDiscordUser } from "@narze/fake-discord";
import {
  Channels,
  DEFAULT_REDIS_URL,
  type PlayerCommand,
  PlayerCommandSchema,
  type PlayerState,
  RedisKeys,
} from "@narze/shared";
import { type Browser, expect, type Page, test } from "@playwright/test";
import Redis from "ioredis";
import { signInThroughPopup } from "./support";

const GUILD = "933000000000000001";
const VOICE = "93";
const owner = { id: "430000000000000001", username: "vocalowner", globalName: "Vera" };
const member = { id: "430000000000000002", username: "vocalmember", globalName: "Mika" };
const url = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
const redis = new Redis(url);
const bot = new Redis(url);
const commands: PlayerCommand[] = [];

const playing: PlayerState = {
  guildId: GUILD,
  current: {
    uri: "https://music.youtube.com/watch?v=lemon",
    source: "youtubemusic",
    title: "Lemon",
    author: "Kenshi Yonezu",
    durationMs: 255_000,
    artworkUrl: null,
    requester: { id: owner.id, name: "Vera", avatarUrl: null },
  },
  positionMs: 10_000,
  syncedAt: Date.now(),
  paused: false,
  volume: 15,
  loop: "off",
  twentyFourSeven: false,
  queue: [],
  revision: 5000,
  epoch: "voice-e2e",
  lastSeekAt: null,
  voiceChannelId: VOICE,
};

/** A recognizer that "hears" window.__say a moment after start (#113: no microphone in CI). */
const FAKE_SPEECH = `
  window.__say = "";
  class FakeRecognition {
    start() {
      setTimeout(() => {
        const result = [{ transcript: window.__say }];
        result.isFinal = true;
        this.onresult && this.onresult({ resultIndex: 0, results: [result] });
        this.onend && this.onend();
      }, 50);
    }
    stop() { this.onend && this.onend(); }
    abort() {}
  }
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
`;
const NO_SPEECH = "delete window.SpeechRecognition; delete window.webkitSpeechRecognition;";

async function pageFor(
  browser: Browser,
  user: typeof owner,
  script: string,
): Promise<{ page: Page; errors: string[] }> {
  const context = await browser.newContext();
  await context.addInitScript(script);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await setFakeDiscordUser(user, [{ id: GUILD, name: "Voice Room", icon: null, owner: user === owner }]);
  await signInThroughPopup(page, user.globalName);
  await page.goto(`/guilds/${GUILD}`);
  return { page, errors };
}

const say = async (page: Page, text: string) => {
  await page.evaluate((t) => {
    (window as unknown as { __say: string }).__say = t;
  }, text);
  await page.getByRole("button", { name: "สั่งด้วยเสียง" }).click();
};

test.beforeAll(async () => {
  await redis.sadd(RedisKeys.botGuilds, GUILD);
  await redis.del(RedisKeys.voiceStates(GUILD));
  await redis.set(RedisKeys.playerState(GUILD), JSON.stringify(playing));
  await redis.set(
    RedisKeys.playerSummary(GUILD),
    JSON.stringify({ playing: true, queueLength: 0, voiceChannelId: VOICE }),
  );
  await bot.subscribe(Channels.botCommands);
  bot.on("message", (_c, raw) => {
    const cmd = PlayerCommandSchema.parse(JSON.parse(raw));
    commands.push(cmd);
    void redis.publish(Channels.botCommandResults, JSON.stringify({ id: cmd.id, ok: true }));
  });
});

test.afterAll(async () => {
  await redis.srem(RedisKeys.botGuilds, GUILD);
  await redis.del(RedisKeys.playerState(GUILD), RedisKeys.playerSummary(GUILD), RedisKeys.voiceStates(GUILD));
  await bot.quit();
  await redis.quit();
});

test("a browser without speech recognition says so, with no errors (#113 AC2)", async ({ browser }) => {
  const { page, errors } = await pageFor(browser, owner, NO_SPEECH);
  await expect(page.getByTestId("voice-unsupported")).toHaveText("สั่งด้วยเสียงไม่ได้ในเบราว์เซอร์นี้");
  await expect(page.getByRole("button", { name: "สั่งด้วยเสียง" })).toHaveCount(0);
  // The buttons stay: voice is never the only path.
  await expect(page.getByTestId("toggle-pause")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a refused command says why; an allowed one reaches the Bot; the Aurora pauses while the sheet is open (#113)", async ({
  browser,
}) => {
  const mika = await pageFor(browser, member, FAKE_SPEECH);
  await expect(mika.page.locator("[data-paused]")).toHaveAttribute("data-paused", "false");
  await say(mika.page, "ข้ามเพลงครับ");
  const sheet = mika.page.getByRole("dialog", { name: "สั่งด้วยเสียง" });
  await expect(sheet.getByTestId("voice-heard")).toHaveText("ข้ามเพลงครับ");
  // AC3: Mika is not in voice; Control Permission refuses, and the sheet says why.
  await expect(sheet.getByTestId("voice-outcome")).toHaveText("เข้าห้องเสียงก่อนถึงจะควบคุมบอทได้");
  // AC4: one animating canvas — the Aurora is paused while the sheet is open.
  await expect(mika.page.locator("[data-paused]")).toHaveAttribute("data-paused", "true");
  await sheet.getByRole("button", { name: "ปิด" }).click();
  await expect(mika.page.locator("[data-paused]")).toHaveAttribute("data-paused", "false");

  const vera = await pageFor(browser, owner, FAKE_SPEECH);
  await say(vera.page, "เสียงสี่สิบ");
  await expect(vera.page.getByTestId("voice-outcome")).toHaveText("ตั้งเสียงเป็น 40 แล้ว");
  expect(commands.at(-1)?.command).toEqual({ action: "volume", volume: 40 });
  await say(vera.page, "ทำกับข้าวให้หน่อย");
  await expect(vera.page.getByTestId("voice-outcome")).toContainText('ไม่เข้าใจ "ทำกับข้าวให้หน่อย"');
  expect(mika.errors).toEqual([]);
  expect(vera.errors).toEqual([]);
});
