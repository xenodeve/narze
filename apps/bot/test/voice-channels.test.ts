import { describe, expect, mock, test } from "bun:test";
import { perGuildDebounce } from "../src/voice-channels";

describe("voice:update debounce (one per Guild per second, latest state)", () => {
  test("a burst publishes once, after the window", async () => {
    const publish = mock(async () => {});
    const debounce = perGuildDebounce(publish, 30);
    debounce.schedule("1");
    debounce.schedule("1");
    debounce.schedule("2");
    expect(publish).toHaveBeenCalledTimes(0);
    await Bun.sleep(60);
    expect(publish.mock.calls.map((c) => (c as unknown[])[0])).toEqual(["1", "2"]);
  });

  test("a Guild the Bot left is not published, and a failing publish does not throw", async () => {
    const publish = mock(async (id: string) => {
      if (id === "2") throw new Error("redis down");
    });
    const debounce = perGuildDebounce(publish, 20);
    debounce.schedule("1");
    debounce.cancel("1");
    debounce.schedule("2");
    await Bun.sleep(50);
    expect(publish.mock.calls.map((c) => (c as unknown[])[0])).toEqual(["2"]);
  });
});
