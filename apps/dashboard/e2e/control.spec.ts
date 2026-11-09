import { setFakeDiscordUser } from "@narze/fake-discord";
import {
  Channels,
  type CommandResult,
  DEFAULT_REDIS_URL,
  type GuildEvent,
  GuildEventTypes,
  type PlayerCommand,
  PlayerCommandSchema,
  type PlayerState,
  type PlayerSummary,
  RedisKeys,
  type VoiceChannelList,
} from "@narze/shared";
import { type Browser, expect, type Page, test } from "@playwright/test";
import Redis from "ioredis";
import { signInThroughPopup } from "./support";

const GUILD = "932000000000000001";
const VOICE = "91";
const owner = { id: "420000000000000001", username: "olive", globalName: "Olive" };
const member = { id: "420000000000000002", username: "milo", globalName: "Milo" };
const url = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
const redis = new Redis(url);
const bot = new Redis(url);
const commands: PlayerCommand[] = [];
let answer: (cmd: PlayerCommand) => Omit<CommandResult, "id"> = () => ({ ok: true });
let revision = 1000;

function state(over: Partial<PlayerState> = {}): PlayerState {
  return {
    guildId: GUILD,
    current: {
      uri: "https://music.youtube.com/watch?v=lemon",
      source: "youtubemusic",
      title: "Lemon",
      author: "Kenshi Yonezu",
      durationMs: 255_000,
      artworkUrl: null,
      requester: { id: owner.id, name: "Olive", avatarUrl: null },
    },
    positionMs: 10_000,
    syncedAt: Date.now(),
    paused: false,
    volume: 15,
    loop: "off",
    twentyFourSeven: false,
    queue: [],
    revision: ++revision,
    epoch: "control-e2e",
    lastSeekAt: null,
    voiceChannelId: VOICE,
    ...over,
  };
}

/** Plays the Bot's side of the contract: keys first, then the Guild events. */
async function botPublishes(s: PlayerState): Promise<void> {
  const summary: PlayerSummary = { playing: !s.paused, queueLength: s.queue.length, voiceChannelId: s.voiceChannelId };
  await redis.set(RedisKeys.playerState(GUILD), JSON.stringify(s));
  await redis.set(RedisKeys.playerSummary(GUILD), JSON.stringify(summary));
  const event = (type: string, data: unknown): GuildEvent => ({
    type,
    guildId: GUILD,
    revision: s.revision,
    sequence: s.revision,
    ts: Date.now(),
    data,
  });
  await redis.publish(Channels.guildEvents, JSON.stringify(event(GuildEventTypes.playerState, s)));
  await redis.publish(Channels.guildEvents, JSON.stringify(event(GuildEventTypes.playerSummary, summary)));
}

async function voiceUpdate(inVoice: Array<{ id: string; name: string }>): Promise<void> {
  await redis.del(RedisKeys.voiceStates(GUILD));
  for (const m of inVoice) await redis.hset(RedisKeys.voiceStates(GUILD), m.id, VOICE);
  const list: VoiceChannelList = [
    { id: VOICE, name: "Lounge", members: inVoice.map((m) => ({ ...m, avatarUrl: null })) },
    { id: "92", name: "Quiet room", members: [] },
  ];
  await redis.set(RedisKeys.voiceChannels(GUILD), JSON.stringify(list));
  const event: GuildEvent = {
    type: GuildEventTypes.voiceUpdate,
    guildId: GUILD,
    revision: 0,
    sequence: 0,
    ts: Date.now(),
    data: list,
  };
  await redis.publish(Channels.guildEvents, JSON.stringify(event));
}

async function pageFor(browser: Browser, user: typeof owner): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await setFakeDiscordUser(user, [{ id: GUILD, name: "Control Room", icon: null, owner: user === owner }]);
  await signInThroughPopup(page, user.globalName);
  await page.goto(`/guilds/${GUILD}`);
  return page;
}

test.beforeAll(async () => {
  await redis.sadd(RedisKeys.botGuilds, GUILD);
  await redis.del(
    RedisKeys.playerState(GUILD),
    RedisKeys.playerSummary(GUILD),
    RedisKeys.voiceStates(GUILD),
    RedisKeys.voiceChannels(GUILD),
  );
  await bot.subscribe(Channels.botCommands);
  bot.on("message", (_c, raw) => {
    const cmd = PlayerCommandSchema.parse(JSON.parse(raw));
    commands.push(cmd);
    void redis.publish(Channels.botCommandResults, JSON.stringify({ id: cmd.id, ...answer(cmd) }));
  });
});

// A command from an earlier test that arrives late is answered plainly, and is not counted here (#162).
test.beforeEach(() => {
  commands.length = 0;
  answer = () => ({ ok: true });
});

test.afterAll(async () => {
  await redis.srem(RedisKeys.botGuilds, GUILD);
  await redis.del(
    RedisKeys.playerState(GUILD),
    RedisKeys.playerSummary(GUILD),
    RedisKeys.voiceStates(GUILD),
    RedisKeys.voiceChannels(GUILD),
  );
  await bot.quit();
  await redis.quit();
});

test("two users: the owner pauses; a member outside voice is refused, then allowed after joining", async ({
  browser,
}) => {
  await voiceUpdate([]);
  await botPublishes(state());
  const olive = await pageFor(browser, owner);
  const milo = await pageFor(browser, member);

  // The member is not in voice: controls locked, with the reason.
  await expect(milo.getByTestId("control-reason")).toHaveText("เข้าห้องเสียงก่อนถึงจะควบคุมบอทได้");
  await expect(milo.getByTestId("toggle-pause")).toBeDisabled();

  // The owner may control from anywhere; the command reaches the Bot as Olive.
  answer = (cmd) => {
    if (cmd.command.action === "pause") void botPublishes(state({ paused: true }));
    return { ok: true };
  };
  await olive.getByTestId("toggle-pause").click();
  await expect(olive.getByRole("button", { name: "เล่นต่อ", exact: true })).toBeVisible();
  // The button flips optimistically on click, before the command reaches the Bot: wait for it (#162).
  await expect
    .poll(() => commands.at(-1))
    .toMatchObject({ actor: { id: owner.id }, command: { action: "pause" } });

  // The member joins the Bot's channel: their controls turn on within 2 s.
  await voiceUpdate([{ id: member.id, name: "Milo" }]);
  await expect(milo.getByTestId("toggle-pause")).toBeEnabled({ timeout: 2000 });
  await expect(milo.getByTestId("control-reason")).toHaveCount(0);
});

test("a command the server refuses reverts the optimistic change and says why", async ({ browser }) => {
  await voiceUpdate([]);
  await botPublishes(state());
  const olive = await pageFor(browser, owner);
  answer = () => ({ ok: false, error: "failed" });
  await olive.getByTestId("toggle-pause").click();
  await expect(olive.getByTestId("control-message")).toHaveText("ทำไม่สำเร็จ ลองอีกครั้ง");
  await expect(olive.getByRole("button", { name: "พัก", exact: true })).toBeVisible();
});

test("with no Player, the owner picks a voice channel and playback starts there", async ({ browser }) => {
  await redis.del(RedisKeys.playerState(GUILD), RedisKeys.playerSummary(GUILD));
  await redis.publish(
    Channels.guildEvents,
    JSON.stringify({
      type: GuildEventTypes.playerGone,
      guildId: GUILD,
      revision: 0,
      sequence: 0,
      ts: Date.now(),
      data: null,
    }),
  );
  await voiceUpdate([{ id: member.id, name: "Milo" }]);
  const olive = await pageFor(browser, owner);
  answer = (cmd) =>
    cmd.command.action === "play" && cmd.command.voiceChannelId === null
      ? { ok: false, error: "voice-channel-required" }
      : { ok: true };
  await olive.getByLabel("ชื่อเพลงหรือลิงก์").fill("lemon");
  await olive.getByRole("button", { name: "เพิ่มคิว" }).click();
  const picker = olive.getByRole("dialog", { name: "เลือกห้องเสียง" });
  await expect(picker).toBeVisible();
  await expect(picker.getByTestId("voice-channel").first()).toContainText("Milo");
  await picker.getByTestId("voice-channel").filter({ hasText: "Lounge" }).click();
  await expect(picker).toBeHidden();
  await expect
    .poll(() => commands.at(-1))
    .toMatchObject({ command: { action: "play", query: "lemon", voiceChannelId: VOICE } });
});
