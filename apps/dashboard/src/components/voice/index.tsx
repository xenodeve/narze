"use client";

import { type PlayerAction, parseIntent } from "@narze/shared";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { canAnimate } from "@/components/mood-aurora";
import { explain, sendCommand } from "@/lib/control";
import { type SpeechProblem, setVoiceSheetOpen, speechSupported, useSpeech } from "@/lib/voice";
import styles from "./voice.module.css";

// Supplied components (DESIGN.md): the pill in the top bar, the strands inside the sheet.
const VoicePill = dynamic(() => import("@/components/vendor/voice-pill/VoicePill"), { ssr: false });
const Strands = dynamic(() => import("@/components/vendor/strands/Strands"), { ssr: false });

/** What a command did, in the words the buttons' toasts use. */
function done(action: PlayerAction): string {
  switch (action.action) {
    case "play":
      return `เพิ่ม "${action.query}" แล้ว`;
    case "skip":
      return "ข้ามเพลงแล้ว";
    case "previous":
      return "เริ่มเพลงนี้ใหม่แล้ว";
    case "pause":
      return "หยุดชั่วคราวแล้ว";
    case "resume":
      return "เล่นต่อแล้ว";
    case "volume":
      return `ตั้งเสียงเป็น ${action.volume} แล้ว`;
    case "loop":
      return action.mode === "off"
        ? "เลิกวนแล้ว"
        : action.mode === "track"
          ? "วนเพลงนี้แล้ว"
          : action.mode === "queue"
            ? "วนทั้งคิวแล้ว"
            : "เปลี่ยนโหมดวนแล้ว";
    case "shuffle":
      return "สุ่มคิวแล้ว";
    default:
      return "ทำแล้ว";
  }
}

const PROBLEM_TH: Record<SpeechProblem, string> = {
  denied: "เบราว์เซอร์ไม่ได้รับอนุญาตให้ใช้ไมโครโฟน เปิดสิทธิ์ไมโครโฟนให้หน้านี้แล้วลองใหม่",
  "no-speech": "ไม่ได้ยินเสียง ลองพูดใหม่อีกครั้ง",
  network: "ระบบแปลงเสียงต่อไม่ติด ลองใหม่อีกครั้ง",
  failed: "ฟังไม่สำเร็จ ลองใหม่อีกครั้ง",
};

type Outcome = { tone: "ok" | "refused" | "unknown"; text: string };

/**
 * Spec #113: the VoicePill starts listening; the sheet shows Strands while listening (the Aurora
 * pauses), the live words, and what happened. Voice is never the only path: every command has a
 * button, and a browser without speech recognition says so.
 */
export function VoiceControl({ guildId }: { guildId: string }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [animate, setAnimate] = useState(false);
  // A fresh pill after each utterance: the supplied pill keeps its own listening state.
  const [round, setRound] = useState(0);
  useEffect(() => {
    setSupported(speechSupported());
    setAnimate(canAnimate());
  }, []);
  useEffect(() => {
    setVoiceSheetOpen(open);
    return () => setVoiceSheetOpen(false);
  }, [open]);

  const act = useCallback(
    async (text: string) => {
      const intent = parseIntent(text);
      if (intent.kind === "unknown") {
        setOutcome({
          tone: "unknown",
          text: `ไม่เข้าใจ "${intent.text}" ลองพูดว่า "ข้าม", "หยุด", "เสียง 40" หรือ "เล่นเพลง …"`,
        });
        return;
      }
      const ack = await sendCommand(guildId, intent.action);
      setOutcome(
        ack.ok ? { tone: "ok", text: done(intent.action) } : { tone: "refused", text: explain(ack) ?? "ทำไม่สำเร็จ" },
      );
    },
    [guildId],
  );
  const speech = useSpeech((text) => {
    void act(text).finally(() => setRound((n) => n + 1));
  });
  // The recognizer ended without a final result (silence, an error): the pill starts over.
  useEffect(() => {
    if (!speech.listening && speech.problem) setRound((n) => n + 1);
  }, [speech.listening, speech.problem]);

  if (supported === null) return null;
  if (!supported) {
    return (
      <span className={styles.unsupported} data-testid="voice-unsupported" title="ใช้ปุ่มควบคุมได้ตามปกติ">
        สั่งด้วยเสียงไม่ได้ในเบราว์เซอร์นี้
      </span>
    );
  }
  return (
    <>
      <VoicePill
        key={round}
        ariaLabel="สั่งด้วยเสียง"
        reactive="simulated"
        mode="auto"
        accentColor="#f1f1f3"
        background="#131316"
        size={32}
        onStart={() => {
          setOutcome(null);
          setOpen(true);
          speech.start();
        }}
        onStop={() => speech.stop()}
      />
      {open ? (
        <section className={styles.sheet} role="dialog" aria-label="สั่งด้วยเสียง" aria-modal="false">
          <div className={`deep ${styles.stage}`}>
            {speech.listening && animate ? <Strands listening intro={false} className={styles.strands} /> : null}
            <p className={styles.heard} aria-live="polite" data-testid="voice-heard">
              {speech.heard || (speech.listening ? "กำลังฟัง…" : " ")}
            </p>
          </div>
          {speech.problem ? (
            <p role="alert" className={styles.refused}>
              {PROBLEM_TH[speech.problem]}
            </p>
          ) : null}
          {outcome ? (
            <p
              role={outcome.tone === "ok" ? "status" : "alert"}
              className={outcome.tone === "ok" ? styles.ok : styles.refused}
              data-testid="voice-outcome"
            >
              {outcome.text}
            </p>
          ) : null}
          <p className={styles.hint}>ลองพูดว่า "เล่นเพลง …", "ข้าม", "หยุด", "เล่นต่อ", "เสียง 40", "วน", "สุ่ม"</p>
          <button
            type="button"
            className={styles.close}
            onClick={() => {
              speech.stop();
              setOpen(false);
            }}
          >
            ปิด
          </button>
        </section>
      ) : null}
    </>
  );
}
