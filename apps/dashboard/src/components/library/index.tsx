"use client";

import type { ImportPreview, Playlist, PlaylistSummary, PlaylistTrack } from "@narze/shared";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Thinking } from "@/components/catalog/thinking";
import { LikeButton } from "@/components/like-button";
import { formatTime } from "@/components/now-playing/progress";
import { type PlayTarget, SelectServer } from "@/components/select-server";
import {
  changePlaylist,
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  listPlaylists,
  previewImport,
  useLibraryUpdates,
  useLikes,
} from "@/lib/library";
import { useSession } from "@/lib/session";
import styles from "./library.module.css";

// The supplied LatticeLoader (DESIGN.md): a timed operation with an outcome — here, the import.
const LatticeLoader = dynamic(() => import("@/components/vendor/lattice-loader/LatticeLoader"), { ssr: false });

function SignedIn({ children }: { children: ReactNode }) {
  const session = useSession();
  if (session.status === "loading") return null;
  if (session.status === "signed-out") return <p role="status">เข้าสู่ระบบด้วย Discord ก่อน แล้วจะเห็นคลังเพลงของคุณ</p>;
  return <>{children}</>;
}

/** The Library grid (#107, spec #89): the user's playlists, Liked, and import. */
export function LibraryPage() {
  return (
    <SignedIn>
      <LibraryGrid />
    </SignedIn>
  );
}

function LibraryGrid() {
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null | "failed">(null);
  const [importing, setImporting] = useState(false);
  const load = useCallback(() => {
    void listPlaylists().then((list) => setPlaylists(list ?? "failed"));
  }, []);
  useEffect(load, [load]);
  useLibraryUpdates(load);
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>คลังเพลง</h1>
        <button type="button" className={styles.primary} onClick={() => setImporting(true)}>
          นำเข้า Playlist
        </button>
      </header>
      {playlists === null ? (
        <Thinking label="กำลังโหลดคลังเพลง" />
      ) : playlists === "failed" ? (
        <p role="alert">โหลดคลังเพลงไม่ได้ ลองรีเฟรช</p>
      ) : (
        <ul className={styles.grid}>
          <li>
            <Link href="/library/liked" className={styles.card}>
              <span className={`${styles.cover} ${styles.liked}`} aria-hidden="true">
                ♥
              </span>
              <span className={styles.name}>เพลงที่ถูกใจ</span>
            </Link>
          </li>
          {playlists.map((p) => (
            <li key={p.id}>
              <Link href={`/library/${p.id}`} className={styles.card}>
                {p.thumbnail ? (
                  // biome-ignore lint/performance/noImgElement: playlist cover from Spotify/YouTube CDNs
                  <img className={styles.cover} src={p.thumbnail} alt="" width={160} height={160} loading="lazy" />
                ) : (
                  <span className={styles.cover} aria-hidden="true">
                    {Array.from(p.name)[0] ?? "♪"}
                  </span>
                )}
                <span className={styles.name}>{p.name}</span>
                <span className={`num ${styles.meta}`}>{p.trackCount} เพลง</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <ImportDialog
        open={importing}
        onClose={() => setImporting(false)}
        onSaved={() => {
          setImporting(false);
          load();
        }}
      />
    </div>
  );
}

/** Spec #89: link → preview → name/description → save; the timed load shows the LatticeLoader. */
function ImportDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [link, setLink] = useState("");
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  useEffect(() => {
    if (open) {
      setLink("");
      setPreview(null);
      setStatus("idle");
      setError(null);
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [open]);

  const load = async () => {
    setStatus("working");
    setError(null);
    const result = await previewImport(link.trim());
    if ("error" in result) {
      setStatus("error");
      setError(result.error);
      return;
    }
    setStatus("done");
    setPreview(result);
    setName(result.playlist.name);
  };
  const save = async () => {
    if (!preview) return;
    const saved = await createPlaylist({
      name: name.trim() || preview.playlist.name,
      description: description.trim() || null,
      tracks: preview.tracks,
      sourcePlatform: preview.platform,
      sourceUrl: link.trim(),
    });
    if (saved) onSaved();
    else setError("บันทึกไม่สำเร็จ ลองอีกครั้ง");
  };

  return (
    <dialog ref={dialog} className={styles.dialog} onClose={onClose} aria-labelledby="import-title">
      <h2 id="import-title" className={styles.dialogTitle}>
        นำเข้า Playlist
      </h2>
      <label className={styles.field}>
        ลิงก์ Playlist ของ Spotify หรือ YouTube
        <input
          className={styles.input}
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://open.spotify.com/playlist/…"
        />
      </label>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.ghost}
          onClick={() => void load()}
          disabled={!link.trim() || status === "working"}
        >
          ดูตัวอย่าง
        </button>
        {status === "idle" ? null : (
          <LatticeLoader
            label="กำลังโหลด Playlist"
            doneLabel="โหลดเสร็จใน"
            errorLabel="ไม่สำเร็จหลัง"
            status={status === "working" ? "working" : status === "done" ? "done" : "error"}
            color="var(--ink-2)"
          />
        )}
      </div>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      {preview ? (
        <div className={styles.preview}>
          <p className={styles.previewHead}>
            <strong>{preview.playlist.name}</strong> · {preview.playlist.owner} ·{" "}
            <span className="num">{preview.playlist.trackCount} เพลง</span>
          </p>
          <ol className={styles.previewList}>
            {preview.tracks.slice(0, 5).map((t) => (
              <li key={t.uri}>
                {t.title} — {t.artist}
              </li>
            ))}
          </ol>
          <label className={styles.field}>
            ชื่อ
            <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </label>
          <label className={styles.field}>
            คำอธิบาย
            <input
              className={styles.input}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
            />
          </label>
        </div>
      ) : null}
      <div className={styles.actions}>
        <button type="button" className={styles.ghost} onClick={onClose}>
          ยกเลิก
        </button>
        <button type="button" className={styles.primary} onClick={() => void save()} disabled={!preview}>
          บันทึก
        </button>
      </div>
    </dialog>
  );
}

function TrackRows({
  tracks,
  onPlay,
  onRemove,
}: {
  tracks: PlaylistTrack[];
  onPlay: (t: PlaylistTrack) => void;
  onRemove?: (index: number) => void;
}) {
  return (
    <ol className={styles.tracks}>
      {tracks.map((t, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a playlist may hold the same track twice; rows are positions
        <li key={`${t.uri}-${i}`} className={styles.track} data-testid="library-track">
          <span className={`num ${styles.index}`}>{i + 1}</span>
          <span className={styles.text}>
            <span className={styles.trackTitle}>{t.title}</span>
            <span className={styles.meta}>
              {t.artist}
              {t.album ? ` · ${t.album}` : ""}
            </span>
          </span>
          <span className={`num ${styles.meta}`}>{formatTime(t.duration)}</span>
          <LikeButton track={t} />
          <button type="button" className={styles.icon} onClick={() => onPlay(t)} aria-label={`เล่น ${t.title}`}>
            ▶
          </button>
          {onRemove ? (
            <button
              type="button"
              className={styles.icon}
              onClick={() => onRemove(i)}
              aria-label={`ลบ ${t.title} ออกจาก Playlist`}
            >
              ✕
            </button>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** A playlist (#107, spec #89): play all, play a track, rename, edit tracks, delete. */
export function PlaylistPage({ id }: { id: string }) {
  return (
    <SignedIn>
      <PlaylistBody id={id} />
    </SignedIn>
  );
}

function PlaylistBody({ id }: { id: string }) {
  const router = useRouter();
  const [playlist, setPlaylist] = useState<Playlist | "missing" | "failed" | null>(null);
  const [target, setTarget] = useState<PlayTarget | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const load = useCallback(() => {
    void getPlaylist(id).then((found) => setPlaylist(found ?? "failed"));
  }, [id]);
  useEffect(load, [load]);
  // AC3: a change saved in another tab arrives here.
  useLibraryUpdates(
    useCallback(
      (changed: string) => {
        if (changed === id) load();
      },
      [id, load],
    ),
  );
  if (playlist === null) return <Thinking label="กำลังโหลด Playlist" />;
  if (playlist === "missing") return <p role="alert">ไม่พบ Playlist นี้</p>;
  if (playlist === "failed") return <p role="alert">โหลดไม่สำเร็จ ลองรีเฟรช</p>;

  const save = async (change: Parameters<typeof changePlaylist>[1], done: string) => {
    const updated = await changePlaylist(id, change);
    if (updated) {
      setPlaylist(updated);
      setToast(done);
    } else setToast("บันทึกไม่สำเร็จ ลองอีกครั้ง");
  };
  // Play all: the source playlist when it came from one, else the first track.
  const playAll = () => {
    const query = playlist.sourceUrl ?? playlist.tracks[0]?.uri;
    if (query) setTarget({ title: playlist.name, query });
  };

  return (
    <div className={styles.page}>
      <header className={styles.detailHead}>
        {renaming ? (
          <form
            className={styles.row}
            onSubmit={(e) => {
              e.preventDefault();
              setRenaming(false);
              void save({ name }, "เปลี่ยนชื่อแล้ว");
            }}
          >
            <label className={styles.field}>
              ชื่อ Playlist
              <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
            </label>
            <button type="submit" className={styles.primary}>
              บันทึกชื่อ
            </button>
          </form>
        ) : (
          <h1 className={styles.title}>{playlist.name}</h1>
        )}
        {playlist.description ? <p className={styles.meta}>{playlist.description}</p> : null}
        <div className={styles.row}>
          <button type="button" className={styles.primary} onClick={playAll} disabled={playlist.tracks.length === 0}>
            เล่นทั้งหมด
          </button>
          <button
            type="button"
            className={styles.ghost}
            onClick={() => {
              setName(playlist.name);
              setRenaming(true);
            }}
          >
            เปลี่ยนชื่อ
          </button>
          <button type="button" className={styles.danger} onClick={() => setConfirming(true)}>
            ลบ Playlist
          </button>
        </div>
      </header>
      {toast ? (
        <p role="status" aria-live="polite" className={styles.toast}>
          {toast}
        </p>
      ) : null}
      <TrackRows
        tracks={playlist.tracks}
        onPlay={(t) => setTarget({ title: t.title, query: t.uri })}
        onRemove={(index) =>
          void save({ tracks: playlist.tracks.filter((_, i) => i !== index) }, "ลบเพลงออกจาก Playlist แล้ว")
        }
      />
      <SelectServer target={target} onClose={() => setTarget(null)} />
      <ConfirmDelete
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          setConfirming(false);
          if (await deletePlaylist(id)) router.push("/library");
          else setToast("ลบไม่สำเร็จ ลองอีกครั้ง");
        }}
      />
    </div>
  );
}

function ConfirmDelete({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return (
    <dialog ref={dialog} className={styles.dialog} onClose={onClose} aria-labelledby="delete-title">
      <h2 id="delete-title" className={styles.dialogTitle}>
        ลบ Playlist นี้?
      </h2>
      <p className={styles.meta}>ลบแล้วย้อนกลับไม่ได้</p>
      <div className={styles.actions}>
        <button type="button" className={styles.ghost} onClick={onClose}>
          ยกเลิก
        </button>
        <button type="button" className={styles.danger} onClick={onConfirm}>
          ลบ
        </button>
      </div>
    </dialog>
  );
}

/** The Liked playlist: every track the user liked, newest first (AC4). */
export function LikedPage() {
  return (
    <SignedIn>
      <LikedBody />
    </SignedIn>
  );
}

function LikedBody() {
  const likes = useLikes();
  const [target, setTarget] = useState<PlayTarget | null>(null);
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>เพลงที่ถูกใจ</h1>
      {likes === null ? (
        <Thinking label="กำลังโหลดเพลงที่ถูกใจ" />
      ) : likes.length === 0 ? (
        <p className={styles.meta}>ยังไม่มีเพลงที่ถูกใจ กดหัวใจที่เพลงไหนก็ได้เพื่อเก็บไว้ที่นี่</p>
      ) : (
        <TrackRows tracks={likes} onPlay={(t) => setTarget({ title: t.title, query: t.uri })} />
      )}
      <SelectServer target={target} onClose={() => setTarget(null)} />
    </div>
  );
}
