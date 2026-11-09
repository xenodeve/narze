"use client";

import type { SearchAlbum, SearchArtist, SearchResponse, SearchSource, SearchTrack } from "@narze/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LikeButton } from "@/components/like-button";
import { formatTime } from "@/components/now-playing/progress";
import { isSoundCloudLink, isSpotifyCollectionLink, searchCatalog, sourceBadge, useSources } from "@/lib/catalog";
import pill from "@/styles/pill-tabs.module.css";
import styles from "./catalog.module.css";
import { Thinking } from "./thinking";

export const SOURCES: Array<{ value: SearchSource; label: string }> = [
  { value: "spotify-api", label: "Spotify" },
  { value: "spotify", label: "Spotify (Lavalink)" },
  { value: "youtube", label: "YouTube" },
  { value: "youtubemusic", label: "YouTube Music" },
];

/** Spec #85: a YouTube/Spotify playlist link plays as one item ("Play Playlist"). */
const isPlaylistLink = (text: string) => /^https?:\/\/\S+(list=|\/playlist\/|\/album\/)/i.test(text.trim());
const isLink = (text: string) => /^https?:\/\//i.test(text.trim());

/** Where an artist card goes: Spotify artists have a page, YouTube channels theirs. */
const artistHref = (a: SearchArtist) => (a.youtubeUrl ? `/channel/${a.id}` : `/artist/${a.id}`);

export function SongRow({ track, onPlay }: { track: SearchTrack; onPlay: (t: SearchTrack) => void }) {
  return (
    <li className={styles.row} data-testid="song-row">
      {track.thumbnail ? (
        // biome-ignore lint/performance/noImgElement: 40px cover from Spotify/YouTube CDNs
        <img className={styles.art} src={track.thumbnail} alt="" width={40} height={40} loading="lazy" />
      ) : (
        <span className={styles.art} aria-hidden="true">
          {Array.from(track.title)[0] ?? "♪"}
        </span>
      )}
      <span className={styles.text}>
        <span className={styles.title}>{track.title}</span>
        <span className={styles.sub}>
          {track.artist}
          <span className={`mono ${styles.badge}`}>{sourceBadge(track)}</span>
          {track.isVideo ? <span className={`mono ${styles.badge}`}>VIDEO</span> : null}
        </span>
      </span>
      <span className={`num ${styles.time}`}>{formatTime(track.duration)}</span>
      <LikeButton track={track} />
      <button type="button" className={styles.play} onClick={() => onPlay(track)} aria-label={`เล่น ${track.title}`}>
        <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14">
          <path d="M5 3l8 5-8 5z" fill="currentColor" />
        </svg>
      </button>
    </li>
  );
}

function TopResult({
  result,
  onPlay,
}: {
  result: NonNullable<SearchResponse["topResult"]>;
  onPlay: (t: SearchTrack) => void;
}) {
  // Spec #90: the top result says how well it matched.
  const percent = Math.min(100, Math.round(result.score * 100));
  const name = result.type === "track" ? result.data.title : result.data.name;
  const href =
    result.type === "artist" ? artistHref(result.data) : result.type === "album" ? `/album/${result.data.id}` : null;
  return (
    <section className={styles.top} data-testid="top-result" aria-labelledby="top-title">
      <p className={styles.kicker}>
        ผลลัพธ์ที่ตรงที่สุด · <span className="num">ตรง {percent}%</span>
      </p>
      <h2 id="top-title" className={styles.topName}>
        {href ? <Link href={href}>{name}</Link> : name}
      </h2>
      {result.type === "track" ? (
        <button type="button" className={styles.primary} onClick={() => onPlay(result.data)}>
          เล่นเพลงนี้
        </button>
      ) : null}
    </section>
  );
}

/**
 * Catalog search (#105, spec #57, #85, #90): a source tab, a debounced query (250 ms), the top
 * result with its match, then songs, artists and albums. A pasted link plays as one item.
 */
export function CatalogSearch({ onPlay }: { onPlay: (item: { title: string; query: string }) => void }) {
  const sources = useSources();
  // #157: without Spotify the Spotify tabs say "coming soon" and search opens on YouTube Music.
  const spotifyOff = sources?.spotify === false;
  const [picked, setPicked] = useState<SearchSource | null>(null);
  const source: SearchSource = picked ?? (spotifyOff ? "youtubemusic" : "spotify-api");
  const soon = (s: SearchSource) => spotifyOff && (s === "spotify" || s === "spotify-api");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResponse | null | "failed">(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const text = query.trim();
    if (!text || isLink(text)) {
      setResult(null);
      setSearching(false);
      return;
    }
    const abort = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      void searchCatalog(text, source, abort.signal).then((found) => {
        if (abort.signal.aborted) return;
        setResult(found ?? "failed");
        setSearching(false);
      });
    }, 250);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, source]);

  const playTrack = (t: SearchTrack) => onPlay({ title: t.title, query: t.uri });
  const text = query.trim();

  return (
    <div className={styles.search}>
      <div className={styles.field}>
        <input
          type="search"
          className={styles.input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ชื่อเพลง ศิลปิน หรือวางลิงก์"
          aria-label="ค้นหาเพลง ศิลปิน หรืออัลบั้ม"
        />
        {searching ? (
          <span className={styles.orb}>
            <Thinking label="กำลังค้นหา" />
          </span>
        ) : null}
      </div>
      <div role="tablist" aria-label="แหล่งเพลง" className={pill.tabs}>
        {SOURCES.map((s) => (
          <button
            key={s.value}
            type="button"
            role="tab"
            aria-selected={source === s.value}
            className={pill.tab}
            disabled={soon(s.value)}
            onClick={() => setPicked(s.value)}
          >
            {s.label}
            {soon(s.value) ? <span className={styles.soon}> · เร็ว ๆ นี้</span> : null}
          </button>
        ))}
      </div>

      {isLink(text) && isSoundCloudLink(text) && sources?.soundcloud !== true ? (
        <p role="status" className={styles.note}>
          SoundCloud รองรับเร็ว ๆ นี้
        </p>
      ) : isLink(text) && spotifyOff && isSpotifyCollectionLink(text) ? (
        <p role="status" className={styles.note}>
          Spotify รองรับเร็ว ๆ นี้ ตอนนี้วางลิงก์เพลงเดี่ยวของ Spotify ได้
        </p>
      ) : isLink(text) ? (
        <button type="button" className={styles.primary} onClick={() => onPlay({ title: text, query: text })}>
          {isPlaylistLink(text) ? "เล่น Playlist นี้" : "เล่นลิงก์นี้"}
        </button>
      ) : result === "failed" ? (
        <p role="alert" className={styles.error}>
          ค้นหาไม่สำเร็จ ลองอีกครั้ง
        </p>
      ) : result ? (
        <Results result={result} onPlay={playTrack} />
      ) : null}
    </div>
  );
}

function Results({ result, onPlay }: { result: SearchResponse; onPlay: (t: SearchTrack) => void }) {
  if (result.tracks.length === 0 && result.artists.length === 0 && result.albums.length === 0) {
    return <p className={styles.note}>ไม่พบผลลัพธ์</p>;
  }
  return (
    <>
      {result.topResult ? <TopResult result={result.topResult} onPlay={onPlay} /> : null}
      {result.tracks.length > 0 ? (
        <section aria-labelledby="songs-title">
          <h2 id="songs-title" className={styles.heading}>
            เพลง
          </h2>
          <ol className={styles.list}>
            {result.tracks.map((t) => (
              <SongRow key={`${t.id}-${t.uri}`} track={t} onPlay={onPlay} />
            ))}
          </ol>
        </section>
      ) : null}
      {result.artists.length > 0 ? (
        <section aria-labelledby="artists-title">
          <h2 id="artists-title" className={styles.heading}>
            ศิลปิน
          </h2>
          <ul className={styles.cards}>
            {result.artists.map((a) => (
              <li key={a.id}>
                <CardLink href={artistHref(a)} image={a.imageUrl} name={a.name} round />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {result.albums.length > 0 ? (
        <section aria-labelledby="albums-title">
          <h2 id="albums-title" className={styles.heading}>
            อัลบั้ม
          </h2>
          <ul className={styles.cards}>
            {result.albums.map((a: SearchAlbum) => (
              <li key={a.id}>
                <CardLink href={`/album/${a.id}`} image={a.imageUrl} name={a.name} sub={a.artistName} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

export function CardLink({
  href,
  image,
  name,
  sub,
  round = false,
}: {
  href: string;
  image?: string | null;
  name: string;
  sub?: string;
  round?: boolean;
}) {
  return (
    <Link href={href} className={styles.card}>
      {image ? (
        // biome-ignore lint/performance/noImgElement: artist/album cover from Spotify/YouTube CDNs
        <img
          className={round ? styles.round : styles.square}
          src={image}
          alt=""
          width={120}
          height={120}
          loading="lazy"
        />
      ) : (
        <span className={round ? styles.round : styles.square} aria-hidden="true">
          {Array.from(name)[0] ?? "♪"}
        </span>
      )}
      <span className={styles.cardName}>{name}</span>
      {sub ? <span className={styles.sub}>{sub}</span> : null}
    </Link>
  );
}
