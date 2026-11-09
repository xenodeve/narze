"use client";

import type { VoiceChannelList } from "@narze/shared";
import { SocketEvents } from "@narze/shared/channels";
import { useEffect, useRef, useState } from "react";
import { apiGet } from "@/lib/api";
import { onSocketEvents } from "@/lib/socket";
import styles from "./controls.module.css";

const AVATARS = 5;

/**
 * Where should the Bot go? Lists the Guild's voice channels with who is in them, live (spec #86).
 * A native <dialog>: focus trap, Escape and the backdrop come with it.
 */
export function VoicePicker({
  open = true,
  guildId,
  onPick,
  onClose,
}: {
  /** False closes it (with the shared fade) before the parent unmounts it (#174). */
  open?: boolean;
  guildId: string;
  onPick: (channel: { id: string; name: string }) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [channels, setChannels] = useState<VoiceChannelList | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);

  useEffect(() => {
    dialog.current?.showModal();
    void apiGet(`/api/guilds/${guildId}/voice-channels`)
      .then((res) => (res.ok ? (res.json() as Promise<VoiceChannelList>) : Promise.reject(res.status)))
      .then(setChannels, () => setFailed(true));
    return onSocketEvents({
      [SocketEvents.voiceChannels]: (raw: unknown) => {
        const update = raw as { guildId?: string; channels?: VoiceChannelList };
        if (update?.guildId === guildId && update.channels) setChannels(update.channels);
      },
    });
  }, [guildId]);

  return (
    <dialog ref={dialog} className={styles.dialog} onClose={onClose} aria-labelledby="picker-title">
      <h2 id="picker-title" className={styles.dialogTitle}>
        เลือกห้องเสียง
      </h2>
      <p className={styles.dialogText}>บอทจะเข้าห้องที่คุณเลือกแล้วเริ่มเล่นเพลง</p>
      {failed ? (
        <p role="alert" className={styles.dialogText}>
          โหลดรายการห้องไม่ได้ ลองใหม่อีกครั้ง
        </p>
      ) : channels === null ? (
        <p className={styles.dialogText}>กำลังโหลดรายการห้อง…</p>
      ) : channels.length === 0 ? (
        <p className={styles.dialogText}>ไม่พบห้องเสียงในเซิร์ฟเวอร์นี้</p>
      ) : (
        <ul className={styles.channels}>
          {channels.map((channel) => (
            <li key={channel.id}>
              <button
                type="button"
                className={styles.channel}
                onClick={() => onPick({ id: channel.id, name: channel.name })}
                data-testid="voice-channel"
              >
                <span className={styles.channelName}>{channel.name}</span>
                <span className={styles.channelMembers}>
                  {channel.members.length === 0 ? (
                    "ไม่มีใครในห้องตอนนี้"
                  ) : (
                    <>
                      <span className={styles.faces} aria-hidden="true">
                        {channel.members.slice(0, AVATARS).map((m) =>
                          m.avatarUrl ? (
                            // biome-ignore lint/performance/noImgElement: 20px Discord avatars
                            <img key={m.id} src={m.avatarUrl} alt="" width={20} height={20} />
                          ) : (
                            <span key={m.id} className={styles.faceInitial}>
                              {Array.from(m.name)[0] ?? "?"}
                            </span>
                          ),
                        )}
                        {channel.members.length > AVATARS ? (
                          <span className={`num ${styles.faceMore}`}>+{channel.members.length - AVATARS}</span>
                        ) : null}
                      </span>
                      <span className={styles.names}>
                        {channel.members
                          .slice(0, 3)
                          .map((m) => m.name)
                          .join(", ")}
                        {channel.members.length > 3 ? ` และอีก ${channel.members.length - 3} คน` : ""}
                      </span>
                    </>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form method="dialog">
        <button type="submit" className={styles.pill}>
          ยกเลิก
        </button>
      </form>
    </dialog>
  );
}
