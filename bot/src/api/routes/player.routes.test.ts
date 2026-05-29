import { expect, test } from "bun:test";

// createConnection() already calls connect() internally (Riffy.js:198).
// Calling connect() again when already connected causes establishing=true to
// linger, making connection.resolve() create a deferred that never resolves
// (10s timeout → "Player connection is not initiated" error).
// Fix: only call connect() when !player.connected.

test("connect() is not called when player is already connected", async () => {
    const calls: string[] = [];
    const player = {
        connected: true,  // already connected (e.g. via join endpoint)
        playing: false,
        paused: false,
        connect() { calls.push("connect"); },
        async play() { calls.push("play"); },
        pause(_toggle: boolean) {},
    };

    if (!player.connected) player.connect();
    await player.play();
    await new Promise(r => setTimeout(r, 300));
    if (player.paused) player.pause(false);

    expect(calls).not.toContain("connect");
    expect(calls).toContain("play");
});

test("connect() is called when player is not connected", async () => {
    const calls: string[] = [];
    const player = {
        connected: false,
        playing: false,
        paused: false,
        connect() { calls.push("connect"); player.connected = true; },
        async play() { calls.push("play"); },
        pause(_toggle: boolean) {},
    };

    if (!player.connected) player.connect();
    await player.play();

    expect(calls[0]).toBe("connect");
    expect(calls[1]).toBe("play");
});

test("player is unpaused if socketClosed paused it during handshake", async () => {
    let pauseCalledWith: boolean | null = null;
    const player = {
        connected: true,
        playing: true,
        paused: false,
        connect() {},
        async play() { player.paused = true; },
        pause(toggle: boolean) { pauseCalledWith = toggle; player.paused = toggle; },
    };

    if (!player.connected) player.connect();
    await player.play();
    await new Promise(r => setTimeout(r, 300));
    if (player.paused) player.pause(false);

    expect(pauseCalledWith).toBe(false);
});
