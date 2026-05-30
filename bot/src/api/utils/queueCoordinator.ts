import { broadcastToGuild, incrementQueueRevision } from "./sse";
import { toRequesterInfo } from "./metadataAdapter";

export type QueueDeps = {
    broadcast: (guildId: string, event: string, data: any) => void;
    incrementRevision: (guildId: string) => void;
};

const defaultDeps: QueueDeps = {
    broadcast: broadcastToGuild,
    incrementRevision: incrementQueueRevision,
};

export function formatCurrentForSSE(track: any): any | null {
    if (!track) return null;
    const requester = toRequesterInfo(track.info?.requester);
    return {
        title: track.info?.title,
        author: track.info?.author,
        duration: track.info?.length,
        thumbnail: track.info?.thumbnail,
        uri: track.info?.uri,
        requester: track.info?.requester,
        requesterName: requester?.username ?? undefined,
        requesterAvatar: requester?.avatar ?? undefined,
    };
}

export function formatQueueForSSE(queue: any[]): any[] {
    return queue.map((t: any) => {
        const requester = toRequesterInfo(t.info?.requester);
        return {
            title: t.info?.title || "Unknown",
            author: t.info?.author || "Unknown Artist",
            duration: t.info?.length || 0,
            thumbnail: t.info?.artworkUrl || t.info?.thumbnail || undefined,
            requesterAvatar: requester?.avatar ?? undefined,
            requesterName: requester?.username ?? undefined,
        };
    });
}

export function enqueueAndNotify(
    player: any,
    guildId: string,
    tracks: any[],
    requesterInput: unknown,
    deps?: Partial<QueueDeps>
): void {
    const { broadcast, incrementRevision } = { ...defaultDeps, ...deps };

    for (const track of tracks) {
        player.queue.add(track);
    }

    incrementRevision(guildId);
    broadcast(guildId, "queueUpdate", { queue: formatQueueForSSE(player.queue) });
}
