import { expect, test, mock } from "bun:test";
import { enqueueAndNotify, formatCurrentForSSE } from "./queueCoordinator";

// --- formatCurrentForSSE ---

test("formatCurrentForSSE returns null when no current track", () => {
    expect(formatCurrentForSSE(null)).toBeNull();
});

test("formatCurrentForSSE includes requesterName and requesterAvatar from Dashboard JSON", () => {
    const track = {
        info: {
            title: "My Song",
            author: "Some Artist",
            length: 200000,
            thumbnail: "https://thumb.com/t.jpg",
            uri: "https://youtube.com/watch?v=abc",
            requester: { discordId: "777", username: "dashuser", avatar: "https://cdn.discordapp.com/avatars/777/xyz.png" },
        },
    };

    const result = formatCurrentForSSE(track);

    expect(result?.requesterName).toBe("dashuser");
    expect(result?.requesterAvatar).toBe("https://cdn.discordapp.com/avatars/777/xyz.png");
});

test("formatCurrentForSSE returns undefined requesterAvatar when avatar is null", () => {
    const track = {
        info: {
            title: "No Avatar Song",
            author: "Artist",
            length: 100000,
            thumbnail: null,
            uri: "https://youtube.com/watch?v=def",
            requester: { discordId: "888", username: "noavatar" },
        },
    };

    const result = formatCurrentForSSE(track);

    expect(result?.requesterName).toBe("noavatar");
    expect(result?.requesterAvatar).toBeUndefined();
});

function makeMockPlayer(initialTracks: any[] = []) {
    const tracks = [...initialTracks];
    return {
        guildId: "guild-123",
        queue: Object.assign(tracks, {
            add(track: any) { tracks.push(track); },
        }),
    };
}

const sampleTrack = {
    info: {
        title: "Test Song",
        author: "Test Artist",
        length: 180000,
        thumbnail: "https://example.com/thumb.jpg",
        requester: null,
    },
};

// --- Issue #18/#20: formatQueueForSSE ดึง avatar จาก Dashboard JSON requester ---

test("formatQueueForSSE extracts requesterAvatar from dashboard JSON with avatar URL", () => {
    const trackWithAvatar = {
        info: {
            title: "Song",
            author: "Artist",
            length: 120000,
            thumbnail: null,
            requester: {
                discordId: "123",
                username: "dashuser",
                avatar: "https://cdn.discordapp.com/avatars/123/abc.png",
            },
        },
    };

    const { formatQueueForSSE } = require("./queueCoordinator");
    const result = formatQueueForSSE([trackWithAvatar]);

    expect(result[0].requesterName).toBe("dashuser");
    expect(result[0].requesterAvatar).toBe("https://cdn.discordapp.com/avatars/123/abc.png");
});

// --- Cycle 4: incrementRevision ถูก call 1 ครั้ง ---

test("enqueueAndNotify calls incrementRevision exactly once with correct guildId", () => {
    const player = makeMockPlayer();
    const broadcast = mock();
    const incrementRevision = mock();

    enqueueAndNotify(player, "guild-123", [sampleTrack], null, { broadcast, incrementRevision });

    expect(incrementRevision).toHaveBeenCalledTimes(1);
    expect(incrementRevision.mock.calls[0][0]).toBe("guild-123");
});

// --- Cycle 3: requester จาก Dashboard JSON ถูก extract ถูกต้อง ---

test("enqueueAndNotify correctly extracts requesterName from Dashboard JSON requester", () => {
    const player = makeMockPlayer();
    const broadcast = mock();
    const incrementRevision = mock();

    const trackWithDashboardRequester = {
        info: {
            title: "Dashboard Song",
            author: "Artist",
            length: 200000,
            thumbnail: null,
            requester: { discordId: "456", username: "dashuser" },
        },
    };

    enqueueAndNotify(player, "guild-123", [trackWithDashboardRequester], null, { broadcast, incrementRevision });

    const payload = broadcast.mock.calls[0][2];
    expect(payload.queue[0].requesterName).toBe("dashuser");
    expect(payload.queue[0].requesterAvatar).toBeUndefined();
});

// --- Cycle 2: payload มีข้อมูลเพลงที่เพิ่ม ---

test("enqueueAndNotify broadcast payload contains added track title and author", () => {
    const player = makeMockPlayer();
    const broadcast = mock();
    const incrementRevision = mock();

    enqueueAndNotify(player, "guild-123", [sampleTrack], null, { broadcast, incrementRevision });

    const payload = broadcast.mock.calls[0][2];
    expect(payload.queue).toHaveLength(1);
    expect(payload.queue[0].title).toBe("Test Song");
    expect(payload.queue[0].author).toBe("Test Artist");
    expect(payload.queue[0].duration).toBe(180000);
});

// --- Cycle 1: broadcast ถูก call ด้วย 'queueUpdate' ---

test("enqueueAndNotify calls broadcast with 'queueUpdate' event", () => {
    const player = makeMockPlayer();
    const broadcast = mock();
    const incrementRevision = mock();

    enqueueAndNotify(player, "guild-123", [sampleTrack], null, { broadcast, incrementRevision });

    expect(broadcast).toHaveBeenCalledTimes(1);
    expect(broadcast.mock.calls[0][1]).toBe("queueUpdate");
});
