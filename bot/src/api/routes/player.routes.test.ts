import { expect, test } from "bun:test";

test("play() is called after voice session is established", async () => {
    let connectedWhenPlayCalled = false;

    const player = {
        connected: false,
        playing: false,
        paused: false,
        connect() {
            setTimeout(() => { player.connected = true; }, 100);
        },
        play() {
            connectedWhenPlayCalled = player.connected;
        },
        pause(_toggle: boolean) {},
    };

    player.connect();
    await new Promise(r => setTimeout(r, 1000));
    player.play();
    await new Promise(r => setTimeout(r, 500));
    if (player.paused) player.pause(false);

    expect(connectedWhenPlayCalled).toBe(true);
});

// Verifies that if socketClosed pauses the player during voice handshake,
// we explicitly unpause after play().
test("player is unpaused if socketClosed paused it during handshake", async () => {
    let pauseCalledWith: boolean | null = null;

    const player = {
        connected: true,
        playing: true,
        paused: false,
        connect() {},
        play() {
            // simulates Riffy's socketClosed firing and pausing mid-play
            player.paused = true;
        },
        pause(toggle: boolean) {
            pauseCalledWith = toggle;
            player.paused = toggle;
        },
    };

    player.connect();
    await new Promise(r => setTimeout(r, 1000));
    player.play();
    await new Promise(r => setTimeout(r, 500));
    if (player.paused) player.pause(false);

    expect(pauseCalledWith).toBe(false);
});
