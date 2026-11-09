"use client";

import { type PlayerAction, parseIntent } from "@narze/shared";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { ERROR_TH, explain, sendCommand } from "@/lib/control";
import { canAnimate } from "@/lib/motion";
import { useTokenHex } from "@/lib/tokens";
import { type SpeechProblem, setVoiceSheetOpen, speechSupported, useSpeech } from "@/lib/voice";
import styles from "./voice.module.css";

// Supplied components (DESIGN.md): the pill in the top bar, the strands inside the sheet.
const VoicePill = dynamic(() => import("@/components/vendor/voice-pill/VoicePill"), { ssr: false });
const Strands = dynamic(() => import("@/components/vendor/strands/Strands"), { ssr: false });

/** What an allowed command did, said back in the sheet. */
const LOOP_DONE = { off: "เลิกวนแล้ว", track: "วนเพลงนี้แล้ว", queue: "วนทั้งคิวแล้ว" } as const;
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
      return action.mode ? LOOP_DONE[action.mode] : "เปลี่ยนโหมดวนแล้ว";
    case "shuffle":
      return "สุ่มคิวแล้ว";
    default:
      return "ทำแล้ว";
  }
}

const PROBLEM_TH: Record<SpeechProblem, string> = {
  denied: "เบราว์เซอร์ยังไม่ให้ใช้ไมโครโฟน เปิดสิทธิ์ไมโครโฟนให้หน้านี้แล้วลองใหม่",
  "no-speech": "ไม่ได้ยินเสียง ลองพูดใหม่อีกครั้ง",
  network: "ระบบแปลงเสียงต่อไม่ติด ลองใหม่อีกครั้ง",
  failed: "ฟังไม่สำเร็จ ลองใหม่อีกครั้ง",
};

type Outcome = { tone: "ok" | "refused" | "unknown" | "sending"; text: string };

/** The pill's own words for "I am done speaking": anything else (cancel, Escape, blur) throws it away. */
const KEEP = new Set(["tap", "release", "key"]);

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
  // The pill is ink on paper, like a primary button (DESIGN.md: tokens, never fixed colours).
  const ink = useTokenHex("--ink", "#131316");
  const paper = useTokenHex("--bg", "#f5f5f7");
  useEffect(() => {
    setSupported(speechSupported());
    setAnimate(canAnimate());
  }, []);
  useEffect(() => {
    setVoiceSheetOpen(open);
    return () => setVoiceSheetOpen(false);
  }, [open]);

  // Each utterance gets a number; an answer that comes back after a newer one started is dropped.
  const utterance = useRef(0);
  const act = useCallback(
    async (text: string) => {
      const mine = ++utterance.current;
      const intent = parseIntent(text);
      if (intent.kind === "unknown") {
        setOutcome({
          tone: "unknown",
          text: `ไม่เข้าใจ "${intent.text}" ลองพูดว่า "ข้าม", "หยุด", "เสียง 40" หรือ "เล่นเพลง …"`,
        });
        return;
      }
      setOutcome({ tone: "sending", text: "กำลังส่งคำสั่ง…" });
      const ack = await sendCommand(guildId, intent.action);
      if (mine !== utterance.current) return;
      setOutcome(
        ack.ok
          ? { tone: "ok", text: done(intent.action) }
          : { tone: "refused", text: explain(ack) ?? ERROR_TH.failed ?? "" },
      );
    },
    [guildId],
  );
  const speech = useSpeech((text) => void act(text));
  // The pill is uncontrolled: whenever listening ends (a result, silence, an error, a cancel) it
  // gets a fresh mount, so it never shows "listening" while nothing listens.
  const wasListening = useRef(false);
  useEffect(() => {
    if (wasListening.current && !speech.listening) setRound((n) => n + 1);
    wasListening.current = speech.listening;
  }, [speech.listening]);
  const close = useCallback(() => {
    speech.abort();
    utterance.current++;
    setOpen(false);
  }, [speech.abort]);
  // Escape closes the sheet, and the sheet takes focus when it opens (a dialog, WCAG 2.2).
  const sheet = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    sheet.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

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
        accentColor={paper}
        iconColor={paper}
        background={ink}
        // Strands is the sheet's one animating canvas (DESIGN.md); the pill draws no wave of its own.
        waveform={false}
        size={32}
        onStart={() => {
          setOutcome(null);
          setOpen(true);
          speech.start();
        }}
        onStop={({ reason }) => (KEEP.has(reason) ? speech.stop() : speech.abort())}
      />
      {/* The sheet drops from the pill and folds back into it (#174), like the dialogs. */}
      <MotionConfig reducedMotion="user">
        <AnimatePresence>
          {open ? (
            <motion.section
              key="voice-sheet"
              ref={sheet}
              tabIndex={-1}
              className={styles.sheet}
              role="dialog"
              aria-label="สั่งด้วยเสียง"
              aria-modal="false"
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              style={{ transformOrigin: "top right" }}
            >
              <div className={`deep ${styles.stage}`}>
                {animate ? (
                  <Strands listening={speech.listening} intro={false} className={styles.strands} />
                ) : (
                  // No WebGL, reduced motion or Save-Data: the flat wash (DESIGN.md §8).
                  <div className={styles.wash} />
                )}
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
                  role={outcome.tone === "ok" || outcome.tone === "sending" ? "status" : "alert"}
                  className={outcome.tone === "ok" || outcome.tone === "sending" ? styles.ok : styles.refused}
                  data-testid="voice-outcome"
                >
                  {outcome.text}
                </p>
              ) : null}
              <p className={styles.hint}>ลองพูดว่า "เล่นเพลง …", "ข้าม", "หยุด", "เล่นต่อ", "เสียง 40", "วน", "สุ่ม"</p>
              <button type="button" className={styles.close} onClick={close}>
                ปิด
              </button>
            </motion.section>
          ) : null}
        </AnimatePresence>
      </MotionConfig>
    </>
  );
}
