"use client";

import {
  type ImportPreview,
  LIKED_PLAYLIST,
  type Playlist,
  type PlaylistSummary,
  type PlaylistTrack,
} from "@narze/shared";
import { moveTrack } from "@narze/shared/queue";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SignedIn } from "@/components/catalog/browse";
import { Thinking } from "@/components/catalog/thinking";
import { LikeButton } from "@/components/like-button";
import { LoadError } from "@/components/load-error";
import { formatTime } from "@/components/now-playing/progress";
import { Toast, type ToastMessage, toastOf } from "@/components/toast";
import { isSpotifyLink, useSources } from "@/lib/catalog";
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
import styles from "./library.module.css";

// The supplied LatticeLoader (DESIGN.md): a timed operation with an outcome — here, the import.
const LatticeLoader = dynamic(() => import("@/components/vendor/lattice-loader/LatticeLoader"), { ssr: false });

const SIGNED_OUT = "เข้าสู่ระบบด้วย Discord ก่อน แล้วจะเห็นคลังเพลงของคุณ";
type Play = (target: { title: string; query: string }) => void;

/** The Library grid (#107, spec #89): the user's playlists, Liked, and import. */
export function LibraryPage() {
  return <SignedIn signedOut={SIGNED_OUT}>{() => <LibraryGrid />}</SignedIn>;
}

function LibraryGrid() {
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null | "failed">(null);
  const [importing, setImporting] = useState(false);
  const [creating, setCreating] = useState(false);
  const load = useCallback(() => {
    void listPlaylists().then((list) => setPlaylists(list ?? "failed"));
  }, []);
  useEffect(load, [load]);
  useLibraryUpdates(
    useCallback(
      (changed: string) => {
        if (changed !== LIKED_PLAYLIST) load();
      },
      [load],
    ),
  );
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>คลังเพลง</h1>
        <div className={styles.row}>
          <button type="button" className={styles.ghost} onClick={() => setCreating(true)}>
            สร้าง Playlist
          </button>
          <button type="button" className={styles.primary} onClick={() => setImporting(true)}>
            นำเข้า Playlist
          </button>
        </div>
      </header>
      {playlists === null ? (
        <Thinking label="กำลังโหลดคลังเพลง" />
      ) : playlists === "failed" ? (
        <LoadError
          onRetry={() => {
            setPlaylists(null);
            load();
          }}
        >
          โหลดคลังเพลงไม่ได้
        </LoadError>
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
      <CreateDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
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
  const spotifyOff = useSources()?.spotify === false;
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
    // #157: a Spotify playlist needs Spotify, which is not set up yet.
    if (spotifyOff && isSpotifyLink(link)) {
      setPreview(null);
      setStatus("error");
      setError("Spotify รองรับเร็ว ๆ นี้ ตอนนี้ใช้ได้เฉพาะ Playlist ของ YouTube");
      return;
    }
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
      thumbnail: preview.playlist.thumbnail,
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
      {/* A form, so Enter in the link previews it (#176). */}
      <form
        className={styles.previewForm}
        onSubmit={(e) => {
          e.preventDefault();
          if (link.trim() && status !== "working") void load();
        }}
      >
        <label className={styles.field}>
          {spotifyOff ? "ลิงก์ Playlist ของ YouTube (Spotify รองรับเร็ว ๆ นี้)" : "ลิงก์ Playlist ของ Spotify หรือ YouTube"}
          <input
            className={styles.input}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder={spotifyOff ? "https://www.youtube.com/playlist?list=…" : "https://open.spotify.com/playlist/…"}
          />
        </label>
        <div className={styles.row}>
          <button type="submit" className={styles.ghost} disabled={!link.trim() || status === "working"}>
            ดูตัวอย่าง
          </button>
          {status === "idle" ? null : (
            <LatticeLoader
              label="กำลังโหลด Playlist"
              doneLabel="โหลดเสร็จใน"
              errorLabel="ไม่สำเร็จหลัง"
              status={status}
              color="var(--ink-2)"
            />
          )}
        </div>
      </form>
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
      {preview ? null : (
        <p id="import-wait" className={styles.hint}>
          ดูตัวอย่างก่อน แล้วจึงบันทึกได้
        </p>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.ghost} onClick={onClose}>
          ยกเลิก
        </button>
        <button
          type="button"
          className={styles.primary}
          onClick={() => void save()}
          disabled={!preview}
          aria-describedby={preview ? undefined : "import-wait"}
        >
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
  onMove,
}: {
  tracks: PlaylistTrack[];
  onPlay: (t: PlaylistTrack) => void;
  onRemove?: (index: number) => void;
  /** Moves a row one place: `to` is the index it ends up at. */
  onMove?: (from: number, to: number) => void;
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
          {onMove ? (
            <span className={styles.move}>
              <button
                type="button"
                className={styles.icon}
                onClick={() => onMove(i, i - 1)}
                disabled={i === 0}
                aria-label={`เลื่อน ${t.title} ขึ้น`}
              >
                ↑
              </button>
              <button
                type="button"
                className={styles.icon}
                onClick={() => onMove(i, i + 1)}
                disabled={i === tracks.length - 1}
                aria-label={`เลื่อน ${t.title} ลง`}
              >
                ↓
              </button>
            </span>
          ) : null}
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
  return <SignedIn signedOut={SIGNED_OUT}>{(play) => <PlaylistBody id={id} play={play} />}</SignedIn>;
}

function PlaylistBody({ id, play }: { id: string; play: Play }) {
  const router = useRouter();
  const [playlist, setPlaylist] = useState<Playlist | "missing" | "failed" | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
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
  if (playlist === "failed")
    return (
      <LoadError
        onRetry={() => {
          setPlaylist(null);
          load();
        }}
      >
        โหลด Playlist ไม่สำเร็จ
      </LoadError>
    );

  const save = async (change: Parameters<typeof changePlaylist>[1], done: string) => {
    const updated = await changePlaylist(id, change);
    if (updated) {
      setPlaylist(updated);
      setToast(toastOf(done));
    } else setToast(toastOf("บันทึกไม่สำเร็จ ลองอีกครั้ง"));
  };
  // Spec #89: play-all plays the source playlist, so it is only for an imported one.
  const playAll = () => {
    if (playlist.sourceUrl) play({ title: playlist.name, query: playlist.sourceUrl });
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
        <p className={styles.meta}>
          {playlist.sourceUrl
            ? "เล่นทั้งหมดจะเล่นจาก Playlist ต้นทาง ส่วนเพลงที่แก้ไว้ในนี้ กดเล่นทีละเพลงได้"
            : "Playlist นี้สร้างในแอป กดเล่นทีละเพลงได้"}
        </p>
        <div className={styles.row}>
          <button type="button" className={styles.primary} onClick={playAll} disabled={!playlist.sourceUrl}>
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
      <Toast message={toast} onDone={clearToast} />
      <TrackRows
        tracks={playlist.tracks}
        onPlay={(t) => play({ title: t.title, query: t.uri })}
        onRemove={(index) =>
          void save({ tracks: playlist.tracks.filter((_, i) => i !== index) }, "ลบเพลงออกจาก Playlist แล้ว")
        }
        onMove={(from, to) => {
          // moveTrack inserts before `to` in the list it was taken from.
          const tracks = moveTrack(playlist.tracks, from, to > from ? to + 1 : to);
          if (tracks) void save({ tracks }, "จัดลำดับแล้ว");
        }}
      />
      <ConfirmDelete
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          setConfirming(false);
          if (await deletePlaylist(id)) router.push("/library");
          else setToast(toastOf("ลบไม่สำเร็จ ลองอีกครั้ง"));
        }}
      />
    </div>
  );
}

function CreateDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setName("");
      setError(null);
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [open]);
  return (
    <dialog ref={dialog} className={styles.dialog} onClose={onClose} aria-labelledby="create-title">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void createPlaylist({ name: name.trim(), tracks: [] }).then((saved) =>
            saved ? onSaved() : setError("สร้างไม่สำเร็จ ลองอีกครั้ง"),
          );
        }}
      >
        <h2 id="create-title" className={styles.dialogTitle}>
          สร้าง Playlist
        </h2>
        <label className={styles.field}>
          ชื่อ
          <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </label>
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
        <div className={styles.actions}>
          <button type="button" className={styles.ghost} onClick={onClose}>
            ยกเลิก
          </button>
          <button type="submit" className={styles.primary} disabled={!name.trim()}>
            สร้าง
          </button>
        </div>
      </form>
    </dialog>
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
  return <SignedIn signedOut={SIGNED_OUT}>{(play) => <LikedBody play={play} />}</SignedIn>;
}

function LikedBody({ play }: { play: Play }) {
  const likes = useLikes();
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>เพลงที่ถูกใจ</h1>
      {likes === null ? (
        <Thinking label="กำลังโหลดเพลงที่ถูกใจ" />
      ) : likes.length === 0 ? (
        <p className={styles.meta}>ยังไม่มีเพลงที่ถูกใจ กดหัวใจที่เพลงไหนก็ได้เพื่อเก็บไว้ที่นี่</p>
      ) : (
        <TrackRows tracks={likes} onPlay={(t) => play({ title: t.title, query: t.uri })} />
      )}
    </div>
  );
}
