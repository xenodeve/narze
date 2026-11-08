import { describe, expect, test } from "bun:test";
import { CommandResultSchema, PlayerCommandSchema, VoiceChannelListSchema } from "../src/commands";

const actor = { id: "500000000000000001", name: "Dee", avatarUrl: null };
const command = (body: Record<string, unknown>) => ({
  id: "6f1c1e1e-2d55-4a7e-9a50-3a0d9d1f8b11",
  guildId: "960000000000000001",
  actor,
  command: body,
});

describe("Player commands relayed Backend → Bot (#101)", () => {
  test("every web action parses, carrying the acting user (spec #108)", () => {
    for (const body of [
      { action: "pause" },
      { action: "resume" },
      { action: "skip" },
      { action: "previous" },
      { action: "shuffle" },
      { action: "seek", positionMs: 30_000 },
      { action: "volume", volume: 40 },
      { action: "loop", mode: "track" },
      { action: "loop", mode: null },
      { action: "play", query: "lemon", next: true, voiceChannelId: "70" },
      { action: "move", from: 0, to: 3 },
      { action: "skipTo", index: 2 },
      { action: "playNow", index: 1 },
      { action: "remove", index: 0 },
      { action: "clear" },
    ]) {
      expect(PlayerCommandSchema.safeParse(command(body)).success).toBe(true);
    }
  });

  test("bad arguments are refused before they reach the Bot", () => {
    for (const body of [
      { action: "volume", volume: 1001 },
      { action: "seek", positionMs: -1 },
      { action: "loop", mode: "all" },
      { action: "play", query: "", next: false, voiceChannelId: null },
      { action: "destroy" },
      { action: "move", from: -1, to: 0 },
      { action: "remove", index: 1.5 },
    ]) {
      expect(PlayerCommandSchema.safeParse(command(body)).success).toBe(false);
    }
    const { actor: _a, ...anonymous } = command({ action: "pause" });
    expect(PlayerCommandSchema.safeParse(anonymous).success).toBe(false);
  });

  test("a result names its command and says whether it worked", () => {
    expect(CommandResultSchema.safeParse({ id: "x", ok: false, error: "not-found" }).success).toBe(true);
    expect(CommandResultSchema.safeParse({ id: "x" }).success).toBe(false);
  });
});

describe("voice channels for the picker (spec #86)", () => {
  test("each channel lists its members with avatars", () => {
    const list = [{ id: "70", name: "Lounge", members: [{ id: actor.id, name: "Dee", avatarUrl: null }] }];
    expect(VoiceChannelListSchema.parse(list)).toEqual(list);
  });
});
