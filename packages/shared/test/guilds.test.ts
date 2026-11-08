import { describe, expect, test } from "bun:test";
import { CONTROL_REASON_TEXT, controlPermission, GuildSummarySchema, PlayerSummarySchema } from "../src/guilds";

const base = {
  isServerOwner: false,
  isBotOwner: false,
  hasPlayer: false,
  userVoiceChannelId: null,
  botVoiceChannelId: null,
} as const;

describe("Control Permission ladder (CONTEXT.md)", () => {
  test("the Server Owner may always control, and is badged Owner", () => {
    expect(controlPermission({ ...base, isServerOwner: true, hasPlayer: true, botVoiceChannelId: "9" })).toEqual({
      canControl: true,
      reason: "server-owner",
      badge: "owner",
    });
  });

  test("the Bot Owner may always control", () => {
    expect(controlPermission({ ...base, isBotOwner: true, hasPlayer: true, botVoiceChannelId: "9" })).toMatchObject({
      canControl: true,
      reason: "bot-owner",
    });
  });

  test("with no Player, a member in any voice channel can play", () => {
    expect(controlPermission({ ...base, userVoiceChannelId: "5" })).toEqual({
      canControl: true,
      reason: "in-voice",
      badge: "can-play",
    });
  });

  test("with no Player, a member outside voice is View Only and told to join voice", () => {
    expect(controlPermission(base)).toEqual({ canControl: false, reason: "join-voice", badge: "view-only" });
  });

  test("with a Player, only a member in the Bot's voice channel can control, badged In Voice", () => {
    const withPlayer = { ...base, hasPlayer: true, botVoiceChannelId: "9" };
    expect(controlPermission({ ...withPlayer, userVoiceChannelId: "9" })).toEqual({
      canControl: true,
      reason: "in-bot-voice",
      badge: "in-voice",
    });
    expect(controlPermission({ ...withPlayer, userVoiceChannelId: "5" })).toEqual({
      canControl: false,
      reason: "other-voice",
      badge: "view-only",
    });
  });

  test("with a Player, a member outside voice is told to join voice first", () => {
    expect(controlPermission({ ...base, hasPlayer: true, botVoiceChannelId: "9" })).toEqual({
      canControl: false,
      reason: "not-in-voice",
      badge: "view-only",
    });
  });

  test("every reason has the v5 text shown to the user (spec #98)", () => {
    expect(CONTROL_REASON_TEXT).toEqual({
      "server-owner": "Server owner",
      "bot-owner": "Bot owner in this guild",
      "in-voice": "No active player - can start playback",
      "join-voice": "Join a voice channel to start playback",
      "in-bot-voice": "In same voice channel",
      "not-in-voice": "You must be in a voice channel to control the bot",
      "other-voice": "You must be in the same voice channel as the bot",
      "own-voice-only": "You can only start playback in your own voice channel",
    });
  });
});

describe("guild contracts", () => {
  test("a Player summary needs a non-negative integer queue length", () => {
    expect(PlayerSummarySchema.safeParse({ playing: true, queueLength: -1, voiceChannelId: null }).success).toBe(false);
    expect(PlayerSummarySchema.safeParse({ playing: true, queueLength: 3, voiceChannelId: "9" }).success).toBe(true);
  });

  test("a guild summary rejects an unknown badge", () => {
    const summary = {
      id: "1",
      name: "g",
      iconUrl: null,
      memberCount: 4,
      playing: false,
      queueLength: 0,
      badge: "admin",
    };
    expect(GuildSummarySchema.safeParse(summary).success).toBe(false);
    expect(GuildSummarySchema.safeParse({ ...summary, badge: "view-only" }).success).toBe(true);
  });

  test("a guild summary carries the member count, or null when the Bot has not reported it", () => {
    const summary = { id: "1", name: "g", iconUrl: null, playing: false, queueLength: 0, badge: "owner" };
    expect(GuildSummarySchema.safeParse({ ...summary, memberCount: null }).success).toBe(true);
    expect(GuildSummarySchema.safeParse({ ...summary, memberCount: -1 }).success).toBe(false);
    expect(GuildSummarySchema.safeParse(summary).success).toBe(false);
  });
});
