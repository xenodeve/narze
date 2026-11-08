import { describe, expect, test } from "bun:test";
import { progressAt } from "../src/progress";

// Spec #103: client-interpolated progress never jumps backwards by < 5 s unless a seek just happened.
const NO_SEEK = Number.NEGATIVE_INFINITY;
const playing = { positionMs: 10_000, syncedAt: 1_000, paused: false, durationMs: 200_000 };

describe("progressAt (spec #103)", () => {
  test("while playing, progress advances with the clock from the last sync", () => {
    expect(progressAt(playing, 4_000, 12_000, NO_SEEK)).toBe(13_000);
  });

  test("never passes the track length", () => {
    expect(progressAt({ ...playing, durationMs: 11_000 }, 9_000, 10_500, NO_SEEK)).toBe(11_000);
  });

  test("a server value up to 5 s behind what is shown is ignored, so the bar never ticks backwards", () => {
    expect(progressAt(playing, 1_000, 14_000, NO_SEEK)).toBe(14_000);
  });

  test("a jump back of 5 s or more is applied (a real rewind)", () => {
    expect(progressAt(playing, 1_000, 15_000, NO_SEEK)).toBe(10_000);
  });

  test("within 2 s of a seek even a small backwards jump is applied", () => {
    expect(progressAt(playing, 1_000, 14_000, 0)).toBe(10_000);
    expect(progressAt(playing, 3_000, 14_000, 0)).toBe(14_000);
  });

  test("while paused the bar holds, and snaps to the server only past 5 s or right after a seek", () => {
    const paused = { ...playing, paused: true };
    expect(progressAt(paused, 9_000, 12_000, NO_SEEK)).toBe(12_000);
    expect(progressAt(paused, 9_000, 16_000, NO_SEEK)).toBe(10_000);
    expect(progressAt(paused, 9_000, 12_000, 8_000)).toBe(10_000);
  });
});
