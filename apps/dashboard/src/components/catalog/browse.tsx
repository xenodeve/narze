"use client";

import type { SearchTrack } from "@narze/shared";
import { type ReactNode, useEffect, useState } from "react";
import { SignInPrompt } from "@/components/account";
import { LoadError } from "@/components/load-error";
import { type PlayTarget, SelectServer } from "@/components/select-server";
import { type AlbumPage, type ArtistPage, type ChannelPage, catalogPage } from "@/lib/catalog";
import { useSession } from "@/lib/session";
import styles from "./browse.module.css";
import { CardLink, CatalogSearch, SongRow } from "./index";
import { Thinking } from "./thinking";

/**
 * Browse and Library pages need a signed-in user: the catalog, the Library and the play permissions
 * are per user. Children get `play`, which opens Select Server.
 */
export function SignedIn({
  children,
  signedOut = "เข้าสู่ระบบด้วย Discord ก่อน แล้วจะค้นหาเพลงได้",
}: {
  children: (play: (target: PlayTarget) => void) => ReactNode;
  signedOut?: string;
}) {
  const session = useSession();
  const [target, setTarget] = useState<PlayTarget | null>(null);
  if (session.status === "loading") return null;
  if (session.status === "signed-out") return <SignInPrompt>{signedOut}</SignInPrompt>;
  return (
    <>
      {children(setTarget)}
      <SelectServer target={target} onClose={() => setTarget(null)} />
    </>
  );
}

export function SearchPage() {
  return (
    <SignedIn>
      {(play) => (
        <div className={styles.page}>
          <h1 className={styles.title}>ค้นหา</h1>
          <CatalogSearch onPlay={play} />
        </div>
      )}
    </SignedIn>
  );
}

/** Loads one catalog page; the states every browse page shares. */
type Pages = { artist: ArtistPage; album: AlbumPage; channel: ChannelPage };
function useCatalog<K extends keyof Pages>(kind: K, id: string) {
  const [page, setPage] = useState<Pages[K] | "missing" | "failed" | null>(null);
  useEffect(() => {
    let live = true;
    void catalogPage(kind, id).then((found) => {
      if (live) setPage(found ?? "failed");
    });
    return () => {
      live = false;
    };
  }, [kind, id]);
  return page;
}

function Pending({ page }: { page: "missing" | "failed" | null }) {
  // DESIGN.md: an in-flight remote step shows the ThinkingOrb, never a spinner or a bare shimmer.
  if (page === null) return <Thinking label="กำลังโหลด" />;
  if (page === "failed") return <LoadError>โหลดไม่สำเร็จ</LoadError>;
  return (
    <p role="alert" className={styles.note}>
      ไม่พบหน้านี้
    </p>
  );
}

function Tracks({ tracks, play }: { tracks: SearchTrack[]; play: (t: PlayTarget) => void }) {
  return (
    <ol className={styles.list}>
      {tracks.map((t) => (
        <SongRow key={`${t.id}-${t.uri}`} track={t} onPlay={(x) => play({ title: x.title, query: x.uri })} />
      ))}
    </ol>
  );
}

const count = (n: number | undefined, unit: string) =>
  n === undefined ? null : `${new Intl.NumberFormat("th-TH").format(n)} ${unit}`;

/** Spec #60: the artist, its top tracks in TH, its albums and singles. */
export function ArtistView({ id }: { id: string }) {
  return <SignedIn>{(play) => <ArtistBody id={id} play={play} />}</SignedIn>;
}
function ArtistBody({ id, play }: { id: string; play: (t: PlayTarget) => void }) {
  const page = useCatalog("artist", id);
  if (page === null || page === "missing" || page === "failed") return <Pending page={page} />;
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <h1 className={styles.title}>{page.artist.name}</h1>
        <p className={styles.note}>{count(page.artist.followers, "ผู้ติดตาม")}</p>
      </header>
      <h2 className={styles.heading}>เพลงยอดนิยม</h2>
      <Tracks tracks={page.topTracks} play={play} />
      <h2 className={styles.heading}>อัลบั้มและซิงเกิล</h2>
      <ul className={styles.cards}>
        {page.albums.map((a) => (
          <li key={a.id}>
            <CardLink href={`/album/${a.id}`} image={a.imageUrl} name={a.name} sub={a.releaseDate?.slice(0, 4)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Spec #60: the album and all its tracks. */
export function AlbumView({ id }: { id: string }) {
  return <SignedIn>{(play) => <AlbumBody id={id} play={play} />}</SignedIn>;
}
function AlbumBody({ id, play }: { id: string; play: (t: PlayTarget) => void }) {
  const page = useCatalog("album", id);
  if (page === null || page === "missing" || page === "failed") return <Pending page={page} />;
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <h1 className={styles.title}>{page.album.name}</h1>
        <p className={styles.note}>
          {page.album.artistName}
          {page.album.releaseDate ? ` · ${page.album.releaseDate.slice(0, 4)}` : ""}
        </p>
        {page.album.spotifyUrl ? (
          <button
            type="button"
            className={styles.primary}
            onClick={() => play({ title: page.album.name, query: page.album.spotifyUrl ?? "" })}
          >
            เล่นทั้งอัลบั้ม
          </button>
        ) : null}
      </header>
      <Tracks tracks={page.tracks} play={play} />
    </div>
  );
}

/** Spec #60: a YouTube channel and its `official` tracks. */
export function ChannelView({ id }: { id: string }) {
  return <SignedIn>{(play) => <ChannelBody id={id} play={play} />}</SignedIn>;
}
function ChannelBody({ id, play }: { id: string; play: (t: PlayTarget) => void }) {
  const page = useCatalog("channel", id);
  if (page === null || page === "missing" || page === "failed") return <Pending page={page} />;
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <h1 className={styles.title}>{page.channel.name}</h1>
        <p className={styles.note}>{count(page.channel.subscribers, "ผู้ติดตาม")}</p>
        {page.channel.description ? <p className={styles.about}>{page.channel.description}</p> : null}
      </header>
      <Tracks tracks={page.tracks} play={play} />
    </div>
  );
}
