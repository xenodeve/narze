import { afterAll, describe, expect, test } from "bun:test";
import { DEFAULT_REDIS_URL, LOG_RING, type LogLine, LogLineSchema } from "@narze/shared";
import Redis from "ioredis";
import { captureConsole, createRingSink } from "../src/admin/logs";
import { createCpuMeter } from "../src/admin/stats";

const redis = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);
const RING = "test110:log-ring";
const CHANNEL = "test110:logs";

afterAll(async () => {
  await redis.del(RING);
  await redis.quit();
});

describe("the Bot's console, captured (#110, spec #120)", () => {
  test("each console line still prints, and reaches the sink with its level", () => {
    const printed: string[] = [];
    const target = {
      log: (...a: unknown[]) => printed.push(`log ${a.join(" ")}`),
      info: (...a: unknown[]) => printed.push(`info ${a.join(" ")}`),
      debug: (...a: unknown[]) => printed.push(`debug ${a.join(" ")}`),
      warn: (...a: unknown[]) => printed.push(`warn ${a.join(" ")}`),
      error: (...a: unknown[]) => printed.push(`error ${a.join(" ")}`),
    };
    const lines: Array<{ level: string; text: string }> = [];
    const release = captureConsole((line) => lines.push(line), { target, now: () => 7 });
    target.log("[bot] ready", 3);
    target.warn("[bot] slow");
    target.error(new Error("boom"));
    release();
    target.log("after release");
    expect(printed).toEqual([
      "log [bot] ready 3",
      "warn [bot] slow",
      expect.stringContaining("error"),
      "log after release",
    ]);
    expect(lines.map((l) => [l.level, l.text.split("\n")[0]])).toEqual([
      ["info", "[bot] ready 3"],
      ["warn", "[bot] slow"],
      ["error", "Error: boom"],
    ]);
  });

  test("the ring keeps the last 1000 lines, newest first, and each line is published", async () => {
    await redis.del(RING);
    const sub = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);
    await sub.subscribe(CHANNEL);
    const heard: string[] = [];
    sub.on("message", (_c, raw) => heard.push(LogLineSchema.parse(JSON.parse(raw)).text));
    const sink = createRingSink<LogLine>(redis, { ring: RING, channel: CHANNEL, cap: LOG_RING });
    for (let i = 0; i < LOG_RING + 5; i++) sink({ at: i, level: "info", text: `line ${i}` });
    await sink.flushed();
    expect(await redis.llen(RING)).toBe(LOG_RING);
    expect(JSON.parse((await redis.lindex(RING, 0)) ?? "{}").text).toBe(`line ${LOG_RING + 4}`);
    await Bun.sleep(50);
    expect(heard.at(-1)).toBe(`line ${LOG_RING + 4}`);
    await sub.quit();
  });
});

describe("stats samples (#110, spec #109)", () => {
  test("CPU % is the process's share of every core over the window since the last reading", () => {
    let clock = 10_000;
    let cpuMicros = 0;
    const cpu = createCpuMeter({ now: () => clock, cpuMicros: () => cpuMicros, cores: 4 });
    clock += 5_000;
    // 2 s of CPU across 4 cores in 5 s = 10 %.
    cpuMicros += 2_000_000;
    expect(cpu()).toEqual({ at: 15_000, windowMs: 5_000, cpuPercent: 10 });
  });
});
