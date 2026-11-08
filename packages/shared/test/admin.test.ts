import { describe, expect, test } from "bun:test";
import { AdminStatsSchema, DiscordIdSchema, isAtLeast, LogLineSchema, logLevelOf } from "../src/admin";

describe("admin roles (#110, spec #97, #122)", () => {
  test("a developer is an admin too; an admin is not a developer; nobody else is either", () => {
    expect(isAtLeast("developer", "admin")).toBe(true);
    expect(isAtLeast("admin", "admin")).toBe(true);
    expect(isAtLeast("admin", "developer")).toBe(false);
    expect(isAtLeast(null, "admin")).toBe(false);
  });

  test("a Discord ID is a 17 to 20 digit snowflake", () => {
    expect(DiscordIdSchema.safeParse("490000000000000410").success).toBe(true);
    expect(DiscordIdSchema.safeParse("1234").success).toBe(false);
    expect(DiscordIdSchema.safeParse("49000000000000041x").success).toBe(false);
  });
});

describe("admin stats (#110, spec #109)", () => {
  test("every sample says when it was taken and over what window", () => {
    const sample = {
      at: 1,
      windowMs: 5000,
      online: true,
      pingMs: 40,
      uptimeMs: 1000,
      guilds: 2,
      activePlayers: 1,
      cpuPercent: 12.5,
      memory: { usedBytes: 1, totalBytes: 2 },
      caches: [{ name: "youtube-facts", items: 3, bytes: 120 }],
    };
    expect(AdminStatsSchema.parse(sample).windowMs).toBe(5000);
    const { windowMs: _, ...withoutWindow } = sample;
    expect(AdminStatsSchema.safeParse(withoutWindow).success).toBe(false);
  });
});

describe("log lines (#110, spec #113, #120)", () => {
  test("a line carries its level; console methods map onto the four levels", () => {
    expect(LogLineSchema.parse({ at: 1, level: "warn", text: "[bot] x" }).level).toBe("warn");
    expect(logLevelOf("debug")).toBe("info");
    expect(logLevelOf("error")).toBe("error");
  });
});
