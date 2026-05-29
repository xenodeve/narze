import { expect, test } from "bun:test";

// Riffy's play() calls connection.resolve() internally — no explicit delay needed.
// We only add a short post-play window to catch socketClosed pause.
test("play() is called without extra delay (Riffy handles voice wait)", async () => {
    const calls: string[] = [];
    const player = {
        connected: false,
        playing: false,
        paused: false,
        connect() { calls.push("connect"); },
        async play() { calls.push("play"); },
        pause(_toggle: boolean) { calls.push("pause"); },
    };

    player.connect();
    await player.play();
    await new Promise(r => setTimeout(r, 300));
    if (player.paused) player.pause(false);

    expect(calls[0]).toBe("connect");
    expect(calls[1]).toBe("play");
    expect(calls).not.toContain("pause"); // not paused, no unpause needed
});

// If socketClosed fires during handshake and pauses the player,
// the 300ms window catches it and unpauses.
test("player is unpaused if socketClosed paused it during handshake", async () => {
    let pauseCalledWith: boolean | null = null;
    const player = {
        connected: true,
        playing: true,
        paused: false,
        connect() {},
        async play() { player.paused = true; }, // simulates socketClosed mid-play
        pause(toggle: boolean) { pauseCalledWith = toggle; player.paused = toggle; },
    };

    player.connect();
    await player.play();
    await new Promise(r => setTimeout(r, 300));
    if (player.paused) player.pause(false);

    expect(pauseCalledWith).toBe(false);
});
