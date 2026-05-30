import { expect, test } from "bun:test";
import { toRequesterInfo } from "./metadataAdapter";

// --- Cycle 1: Dashboard JSON shape ---

test("toRequesterInfo maps dashboard JSON { discordId, username } to RequesterInfo", () => {
    const result = toRequesterInfo({ discordId: "123456", username: "xenodev" });
    expect(result).toEqual({ id: "123456", username: "xenodev", avatar: null });
});

// --- Cycle 5: Dashboard JSON with avatar ---

test("toRequesterInfo maps dashboard JSON with avatar field", () => {
    const result = toRequesterInfo({
        discordId: "999",
        username: "dashuser",
        avatar: "https://example.com/avatar.png",
    });
    expect(result).toEqual({ id: "999", username: "dashuser", avatar: "https://example.com/avatar.png" });
});

// --- Cycle 4: null/undefined ---

test("toRequesterInfo returns null for null input", () => {
    expect(toRequesterInfo(null)).toBeNull();
});

test("toRequesterInfo returns null for undefined input", () => {
    expect(toRequesterInfo(undefined)).toBeNull();
});

// --- Cycle 3: Discord.js GuildMember shape ---

test("toRequesterInfo extracts id, username, avatar from Discord.js GuildMember object", () => {
    const mockMember = {
        displayAvatarURL: () => "https://cdn.discordapp.com/avatars/111/xyz.png",
        user: {
            id: "111",
            username: "narze",
            displayAvatarURL: () => "https://cdn.discordapp.com/avatars/111/xyz.png",
        },
    };
    const result = toRequesterInfo(mockMember);
    expect(result).toEqual({
        id: "111",
        username: "narze",
        avatar: "https://cdn.discordapp.com/avatars/111/xyz.png",
    });
});

// --- Cycle 2: Discord.js User shape ---

test("toRequesterInfo extracts id, username, avatar from Discord.js User object", () => {
    const mockUser = {
        id: "789",
        username: "xeno",
        displayAvatarURL: () => "https://cdn.discordapp.com/avatars/789/abc.png",
    };
    const result = toRequesterInfo(mockUser);
    expect(result).toEqual({
        id: "789",
        username: "xeno",
        avatar: "https://cdn.discordapp.com/avatars/789/abc.png",
    });
});
