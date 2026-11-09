"use client";

import type { AvatarOutfit, PlayerState, Track } from "@narze/shared";
import dynamic from "next/dynamic";
import Link from "next/link";
import { type CSSProperties, useEffect, useState } from "react";
import { ChartPanel } from "@/components/charts";
import { Controls } from "@/components/controls";
import { GuildAvatar } from "@/components/guild-avatar";
import { LikeButton, libraryTrack } from "@/components/like-button";
import { MoodAurora } from "@/components/mood-aurora";
import { QueuePanel } from "@/components/queue-panel";
import { Skeleton, SkeletonRows } from "@/components/skeleton";
import { TopPlayedPanel } from "@/components/top-played";
import { explain, sendCommand } from "@/lib/control";
import { moodFromArtwork, moodFromText } from "@/lib/mood";
import { useTrackNotifications } from "@/lib/notifications";
import { useGuildSettings } from "@/lib/settings";
import { type Permission, usePlayer, type VoiceStatus } from "@/lib/use-player";
import { useVoiceSheetOpen } from "@/lib/voice";
import styles from "./now-playing.module.css";
import { Progress } from "./progress";
import { SidePanel } from "./side-panel";

// The supplied BellToggle (DESIGN.md): "Notify me" for now-playing notifications, per Guild.
const BellToggle = dynamic(() => import("@/components/vendor/bell-toggle/BellToggle"), { ssr: false });

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
    <div className={`${styles.art} ${styles.phase}`}>
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

const VOICE_TEXT = { reconnecting: "เสียงหลุด กำลังต่อใหม่…", failed: "ต่อเสียงใหม่ไม่สำเร็จ ลองใช้ /join" } as const;

/** A voice drop (spec #28), playing or idle. */
function VoiceLine({ voice }: { voice: VoiceStatus }) {
  if (!voice) return null;
  return (
    <p className={styles.label} data-testid="voice-status" role="status">
      {VOICE_TEXT[voice]}
    </p>
  );
}

function Stage({
  guildId,
  state,
  permission,
  voice,
  outfit,
}: {
  guildId: string;
  state: PlayerState;
  permission: Permission;
  voice: VoiceStatus;
  outfit?: AvatarOutfit;
}) {
  const notify = useTrackNotifications(guildId, state.current);
  const [seekError, setSeekError] = useState<string | null>(null);
  /** A refused seek says why; the bar itself never moved, since it follows the server's state. */
  const seek = async (positionMs: number) => {
    setSeekError(null);
    setSeekError(explain(await sendCommand(guildId, { action: "seek", positionMs })));
  };
  const track = state.current;
  const mood = useMood(track);
  const voiceOpen = useVoiceSheetOpen();
  const avatarState = !track ? "default" : state.paused ? "default" : "working";

  return (
    <section className={styles.stage} style={{ "--mood": mood } as CSSProperties} aria-labelledby="now-title">
      {/* The voice sheet's Strands is the one animating canvas while it is open (#113). */}
      <MoodAurora mood={mood} paused={!track || state.paused || voiceOpen} />
      <div className={styles.content}>
        {track ? (
          <>
            <Artwork track={track} />
            <div className={`${styles.meta} ${styles.phase}`}>
              <p className={styles.label}>{state.paused ? "พักไว้" : "กำลังเล่น"}</p>
              <VoiceLine voice={voice} />
              {/* Sibling keys must differ: the title and the progress bar both re-mount per track. */}
              <h1 id="now-title" key={`title:${track.uri}`} className={styles.title} data-testid="now-title">
                {track.title}
              </h1>
              <p className={styles.author}>{track.author || "Unknown Artist"}</p>
              <LikeButton track={libraryTrack(track)} />
              <p className={styles.requester}>
                {track.requester.avatarUrl ? (
                  // biome-ignore lint/performance/noImgElement: a 24px Discord avatar
                  <img src={track.requester.avatarUrl} alt="" width={24} height={24} />
                ) : null}
                <span>ขอโดย {track.requester.name}</span>
              </p>
              <Progress
                key={`progress:${track.uri}`}
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
          <div className={`${styles.idle} ${styles.phase}`}>
            {state.recovering ? (
              <p className={styles.label} data-testid="recovering" role="status">
                กำลังกู้คิวหลังบอทรีสตาร์ท…
              </p>
            ) : null}
            <VoiceLine voice={voice} />
            {/* An Idle Player (spec #27): the queue ended and 24/7 keeps the Bot in voice. */}
            {!state.recovering && state.twentyFourSeven && state.voiceChannelId ? (
              <p className={styles.label} data-testid="idle-247">
                24/7 · บอทรออยู่ในห้องเสียง
              </p>
            ) : null}
            <h1 id="now-title" className={styles.title}>
              ยังไม่มีเพลงเล่นอยู่
            </h1>
            <p className={styles.author}>ใช้ /play ใน Discord หรือเพิ่มเพลงจากตรงนี้ แล้วเพลงจะขึ้นทันที</p>
            <Controls guildId={guildId} state={null} permission={permission} />
            <TopPlayedPanel guildId={guildId} />
            <ChartPanel guildId={guildId} />
          </div>
        )}
        <div className={styles.avatar} aria-hidden="true">
          <GuildAvatar outfit={outfit} size={56} state={avatarState} color={mood} testId="now-avatar" />
        </div>
        <div className={styles.bell}>
          <BellToggle
            size="sm"
            offLabel="แจ้งเตือนฉัน"
            onLabel="จะแจ้งเตือนเมื่อเปลี่ยนเพลง"
            badge={false}
            pressed={notify.optedIn}
            disabled={notify.blocked}
            onChange={(on: boolean) => void notify.toggle(on)}
            color="var(--ink)"
            background="var(--fill)"
            onColor="var(--bg)"
            onBackground="var(--ink)"
          />
        </div>
      </div>
    </section>
  );
}

/**
 * The guild page while its Player loads (#172): the real page grid, a stage and a side column, so
 * nothing moves when the content lands.
 */
function PlayerSkeleton() {
  return (
    <div
      className={styles.page}
      role="status"
      aria-busy="true"
      aria-label="กำลังโหลดสถานะเพลง"
      data-testid="player-skeleton"
    >
      <span className={styles.settingsLink} aria-hidden="true">
        &nbsp;
      </span>
      <div className={`${styles.stage} ${styles.loading}`} data-testid="skeleton-stage">
        <Skeleton className={styles.stageFill} />
      </div>
      <div className={styles.sideSkeleton} data-testid="skeleton-side">
        <Skeleton className={styles.tabsSkeleton} />
        <SkeletonRows rows={3} />
      </div>
    </div>
  );
}

/** Now Playing for one Guild: the stage with controls (#100, #101) and the queue (#102). */
export function NowPlaying({ guildId, userId }: { guildId: string; userId: string }) {
  const view = usePlayer(guildId, userId);
  const [settings] = useGuildSettings(guildId);
  const outfit = settings.status === "ready" ? settings.view.settings.avatar : undefined;
  if (view.status === "loading") return <PlayerSkeleton />;
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
      <Link className={styles.settingsLink} href={`/guilds/${guildId}/settings`}>
        ตั้งค่าเซิร์ฟเวอร์
      </Link>
      <Stage
        guildId={guildId}
        permission={view.permission}
        voice={view.voice}
        outfit={outfit}
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
      <SidePanel
        guildId={guildId}
        queue={
          <QueuePanel
            guildId={guildId}
            queue={state?.queue ?? []}
            revision={state?.revision ?? 0}
            permission={view.permission}
            jumping={view.jumping}
          />
        }
      />
    </div>
  );
}
