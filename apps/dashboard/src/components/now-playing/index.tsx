"use client";

import type { PlayerState, Track } from "@narze/shared";
import dynamic from "next/dynamic";
import { type CSSProperties, useEffect, useState } from "react";
import { Controls } from "@/components/controls";
import { MoodAurora } from "@/components/mood-aurora";
import { QueuePanel } from "@/components/queue-panel";
import { explain, sendCommand } from "@/lib/control";
import { moodFromArtwork, moodFromText } from "@/lib/mood";
import { type Permission, usePlayer } from "@/lib/use-player";
import styles from "./now-playing.module.css";
import { Progress } from "./progress";

const BotAvatar = dynamic(() => import("bot-avatars").then((m) => m.BotAvatar), { ssr: false });

/** The mood for a track: sampled from its artwork when the host allows, else derived from its title. */
function useMood(track: Track | null): string {
  const fallback = track ? moodFromText(`${track.title}${track.author}`) : "#8a8a96";
  const [mood, setMood] = useState(fallback);
  useEffect(() => {
    setMood(fallback);
    if (!track?.artworkUrl) return;
    let live = true;
    void moodFromArtwork(track.artworkUrl).then((sampled) => {
      if (live && sampled) setMood(sampled);
    });
    return () => {
      live = false;
    };
  }, [track?.artworkUrl, fallback]);
  return mood;
}

/** Artwork with a 420 ms crossfade: the previous cover stays underneath until the new one has loaded. */
function Artwork({ track }: { track: Track }) {
  const [layers, setLayers] = useState<string[]>(track.artworkUrl ? [track.artworkUrl] : []);
  useEffect(() => {
    if (!track.artworkUrl) return setLayers([]);
    setLayers((current) =>
      current.at(-1) === track.artworkUrl ? current : [...current.slice(-1), track.artworkUrl as string],
    );
  }, [track.artworkUrl]);

  return (
    <div className={styles.art}>
      {layers.length === 0 ? <span className={styles.artEmpty} aria-hidden="true" /> : null}
      {layers.map((src, i) => (
        // biome-ignore lint/performance/noImgElement: cover art from YouTube/Spotify CDNs, crossfaded by hand
        <img
          key={src}
          src={src}
          alt=""
          width={280}
          height={280}
          className={styles.cover}
          data-top={i === layers.length - 1}
          onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
        />
      ))}
    </div>
  );
}

function Stage({ guildId, state, permission }: { guildId: string; state: PlayerState; permission: Permission }) {
  const [seekError, setSeekError] = useState<string | null>(null);
  /** A refused seek says why; the bar itself never moved, since it follows the server's state. */
  const seek = async (positionMs: number) => {
    setSeekError(null);
    setSeekError(explain(await sendCommand(guildId, { action: "seek", positionMs })));
  };
  const track = state.current;
  const mood = useMood(track);
  const avatarState = !track ? "default" : state.paused ? "default" : "working";

  return (
    <section className={styles.stage} style={{ "--mood": mood } as CSSProperties} aria-labelledby="now-title">
      <MoodAurora mood={mood} paused={!track || state.paused} />
      <div className={styles.content}>
        {track ? (
          <>
            <Artwork track={track} />
            <div className={styles.meta}>
              <p className={styles.label}>{state.paused ? "พักไว้" : "กำลังเล่น"}</p>
              <h1 id="now-title" key={track.uri} className={styles.title} data-testid="now-title">
                {track.title}
              </h1>
              <p className={styles.author}>{track.author || "Unknown Artist"}</p>
              <p className={styles.requester}>
                {track.requester.avatarUrl ? (
                  // biome-ignore lint/performance/noImgElement: a 24px Discord avatar
                  <img src={track.requester.avatarUrl} alt="" width={24} height={24} />
                ) : null}
                <span>ขอโดย {track.requester.name}</span>
              </p>
              <Progress
                key={track.uri}
                state={state}
                onSeek={permission.canControl ? (ms) => void seek(ms) : undefined}
              />
              {seekError ? (
                <p role="alert" className={styles.seekError}>
                  {seekError}
                </p>
              ) : null}
              <Controls guildId={guildId} state={state} permission={permission} />
            </div>
          </>
        ) : (
          <div className={styles.idle}>
            {/* An Idle Player (spec #27): the queue ended and 24/7 keeps the Bot in voice. */}
            {state.twentyFourSeven && state.voiceChannelId ? (
              <p className={styles.label} data-testid="idle-247">
                24/7 · บอทรออยู่ในห้องเสียง
              </p>
            ) : null}
            <h1 id="now-title" className={styles.title}>
              ยังไม่มีเพลงเล่นอยู่
            </h1>
            <p className={styles.author}>ใช้ /play ใน Discord หรือเพิ่มเพลงจากตรงนี้ แล้วเพลงจะขึ้นทันที</p>
            <Controls guildId={guildId} state={null} permission={permission} />
          </div>
        )}
        <div className={styles.avatar} aria-hidden="true">
          <BotAvatar type="clover" size={56} state={avatarState} headphones color={mood} />
        </div>
      </div>
    </section>
  );
}

/** Now Playing for one Guild: the stage with controls (#100, #101) and the queue (#102). */
export function NowPlaying({ guildId, userId }: { guildId: string; userId: string }) {
  const view = usePlayer(guildId, userId);
  if (view.status === "loading") return <div className={`${styles.stage} ${styles.loading}`} aria-busy="true" />;
  if (view.status === "forbidden") {
    return (
      <p role="alert" className={styles.notice}>
        คุณไม่ได้อยู่ในเซิร์ฟเวอร์นี้ หรือบอทยังไม่ได้เข้าเซิร์ฟเวอร์
      </p>
    );
  }
  if (view.status === "failed")
    return (
      <p role="alert" className={styles.notice}>
        โหลดสถานะเพลงไม่ได้ ลองรีเฟรชหน้านี้
      </p>
    );
  const state = view.state ?? null;
  return (
    <div className={styles.page}>
      <Stage
        guildId={guildId}
        permission={view.permission}
        state={
          state ?? {
            guildId,
            current: null,
            positionMs: 0,
            syncedAt: 0,
            paused: false,
            volume: 15,
            loop: "off",
            twentyFourSeven: false,
            queue: [],
            revision: 0,
            epoch: "idle",
            lastSeekAt: null,
            voiceChannelId: null,
          }
        }
      />
      <QueuePanel
        guildId={guildId}
        queue={state?.queue ?? []}
        revision={state?.revision ?? 0}
        permission={view.permission}
        jumping={view.jumping}
      />
    </div>
  );
}
