export interface RequesterInfo {
    id: string;
    username: string;
    avatar: string | null;
}

export function toRequesterInfo(input: unknown): RequesterInfo | null {
    if (!input) return null;

    if (typeof input !== "object") return null;
    const obj = input as any;

    // Discord.js GuildMember: has .user.id, .user.username, .displayAvatarURL()
    if (obj.user && typeof obj.user.id === "string" && typeof obj.user.username === "string") {
        return {
            id: obj.user.id,
            username: obj.user.username,
            avatar: typeof obj.displayAvatarURL === "function" ? obj.displayAvatarURL() ?? null : null,
        };
    }

    // Discord.js User: has id, username, displayAvatarURL()
    if (typeof obj.id === "string" && typeof obj.username === "string" && typeof obj.displayAvatarURL === "function") {
        return {
            id: obj.id,
            username: obj.username,
            avatar: obj.displayAvatarURL() ?? null,
        };
    }

    // Dashboard JSON: { discordId, username, avatar? }
    if ("discordId" in obj) {
        return {
            id: String(obj.discordId),
            username: obj.username ?? "Unknown",
            avatar: obj.avatar ?? null,
        };
    }

    return null;
}
