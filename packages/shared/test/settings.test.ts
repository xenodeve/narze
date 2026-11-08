import { describe, expect, test } from "bun:test";
import { AvatarOutfitSchema, DEFAULT_OUTFIT, GuildSettingsSchema, SettingsUpdateSchema } from "../src/settings";

describe("guild settings (#106, spec #121)", () => {
  test("a stored row parses; an empty outfit is the default clover with headphones", () => {
    const row = { guildId: "1", guildName: "Club", ownerId: "2", musicChannelId: null, avatar: {} };
    expect(GuildSettingsSchema.parse(row)).toEqual({ ...row, avatar: DEFAULT_OUTFIT });
    expect(DEFAULT_OUTFIT).toEqual({
      type: "clover",
      hat: "none",
      glasses: "none",
      headphones: true,
      bowTie: false,
      accessoryColor: "#1d1d1f",
    });
  });

  test("the outfit accepts only what bot-avatars can draw", () => {
    expect(AvatarOutfitSchema.safeParse({ type: "cat", hat: "crown", glasses: "shades" }).success).toBe(true);
    expect(AvatarOutfitSchema.safeParse({ type: "dragon" }).success).toBe(false);
    expect(AvatarOutfitSchema.safeParse({ hat: "fez" }).success).toBe(false);
    expect(AvatarOutfitSchema.safeParse({ accessoryColor: "red; background: url(x)" }).success).toBe(false);
  });

  test("an update sets the Music Channel (null clears it) and/or the outfit; ids must be snowflakes", () => {
    expect(SettingsUpdateSchema.parse({ musicChannelId: null })).toEqual({ musicChannelId: null });
    expect(SettingsUpdateSchema.parse({ avatar: { hat: "beret" } }).avatar?.hat).toBe("beret");
    expect(SettingsUpdateSchema.safeParse({ musicChannelId: "general" }).success).toBe(false);
    expect(SettingsUpdateSchema.safeParse({}).success).toBe(false);
  });

  test("a partial outfit change carries only the fields given (the rest stay as stored)", () => {
    expect(SettingsUpdateSchema.parse({ avatar: { hat: "beret" } }).avatar).toEqual({ hat: "beret" });
  });
});
