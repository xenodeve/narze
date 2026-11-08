import { type ImportPreview, importPlatform, type PlaylistTrack } from "@narze/shared";
import type { SpotifyApi } from "@narze/shared/spotify-api";
import type { LavalinkLoad } from "../search/search-service";

interface LoadedPlaylist {
  info?: { name?: string; author?: string | null };
  pluginInfo?: { author?: string; artworkUrl?: string | null };
  tracks?: Array<{
    info: {
      identifier?: string;
      title?: string;
      author?: string;
      length?: number;
      uri?: string | null;
      artworkUrl?: string | null;
    };
  }>;
}
interface SpotifyItem {
  added_at?: string | null;
  track?: { id?: string | null; album?: { name?: string } | null } | null;
}

export class ImportRefused extends Error {}

/**
 * The import preview (#107, spec #50, #71): a Spotify or YouTube playlist as tracks, before it is
 * saved. Only those hosts are loaded (`importPlatform`); Spotify playlists gain each track's album
 * and the date it was added from the Spotify API, matched by Spotify id.
 */
export function createImporter({
  loadTracks,
  spotify,
}: {
  loadTracks: (identifier: string) => Promise<LavalinkLoad>;
  spotify: SpotifyApi;
}) {
  async function spotifyDetails(link: string) {
    const id = /\/playlist\/([A-Za-z0-9]+)/.exec(new URL(link).pathname)?.[1];
    if (!id) return { owner: null, items: new Map<string, SpotifyItem>() };
    type Page = { items?: SpotifyItem[]; next?: string | null };
    const first = await spotify.get<{ owner?: { display_name?: string }; tracks?: Page }>(
      `/playlists/${id}?fields=owner(display_name),tracks(items(added_at,track(id,album(name))),next)`,
    );
    const items = [...(first?.tracks?.items ?? [])];
    let next = first?.tracks?.next ?? null;
    for (let pages = 0; next && pages < 50; pages++) {
      const page: Page | null = await spotify.get<Page>(next);
      items.push(...(page?.items ?? []));
      next = page?.next ?? null;
    }
    const byId = new Map(items.flatMap((item) => (item.track?.id ? [[item.track.id, item] as const] : [])));
    return { owner: first?.owner?.display_name ?? null, items: byId };
  }

  return async (link: string): Promise<ImportPreview> => {
    const platform = importPlatform(link);
    if (!platform) throw new ImportRefused("only Spotify or YouTube playlist links can be imported");
    const load = await loadTracks(link);
    if (load.loadType !== "playlist") throw new ImportRefused("not a playlist, or it is empty");
    const data = load.data as LoadedPlaylist;
    const loaded = data.tracks ?? [];
    if (loaded.length === 0) throw new ImportRefused("not a playlist, or it is empty");
    const details = platform === "spotify" ? await spotifyDetails(link) : null;
    const now = new Date().toISOString();
    const tracks: PlaylistTrack[] = loaded.map((t) => {
      const extra = t.info.identifier ? details?.items.get(t.info.identifier) : undefined;
      return {
        title: t.info.title ?? "",
        artist: t.info.author || "Unknown Artist",
        duration: t.info.length ?? 0,
        thumbnail: t.info.artworkUrl ?? null,
        uri: t.info.uri ?? "",
        album: extra?.track?.album?.name ?? null,
        addedAt: extra?.added_at ?? now,
      };
    });
    return {
      platform,
      playlist: {
        name: data.info?.name ?? "Playlist",
        thumbnail: data.pluginInfo?.artworkUrl ?? tracks[0]?.thumbnail ?? null,
        trackCount: tracks.length,
        owner: details?.owner ?? data.pluginInfo?.author ?? tracks[0]?.artist ?? "Unknown",
      },
      tracks: tracks.filter((t) => t.uri),
    };
  };
}

export type Importer = ReturnType<typeof createImporter>;
