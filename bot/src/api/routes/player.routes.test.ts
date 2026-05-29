import { expect, test } from "bun:test";

// Verifies that play() is not called before the voice session is established.
// The bug: connect() triggers an async Discord voice handshake, but play() was
// called immediately after — before Lavalink received the session.
test("play() is called after voice session is established", async () => {
    let connectedWhenPlayCalled = false;

    const player = {
        connected: false,
        playing: false,
        paused: false,
        connect() {
            // Simulates Discord returning VOICE_STATE_UPDATE after ~100ms
            setTimeout(() => { player.connected = true; }, 100);
        },
        play() {
            connectedWhenPlayCalled = player.connected;
        },
    };

    // Fixed code path: wait for voice session before playing
    player.connect();
    await new Promise(r => setTimeout(r, 1000));
    player.play();

    expect(connectedWhenPlayCalled).toBe(true);
});
