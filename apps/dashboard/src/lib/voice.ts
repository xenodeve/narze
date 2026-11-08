"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/** The Web Speech API's recognizer, as far as Voice Commands use it (#113). */
interface Recognizer {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognizerClass = new () => Recognizer;

function recognizerClass(): RecognizerClass | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognizerClass; webkitSpeechRecognition?: RecognizerClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Whether this browser can listen at all (Chrome and Edge can; Firefox cannot). */
export const speechSupported = () => recognizerClass() !== null;

/** Thai first; a browser without a Thai model falls back to English (#113). */
const LANGUAGES = ["th-TH", "en-US"] as const;

export type SpeechProblem = "denied" | "no-speech" | "network" | "failed";

/**
 * One utterance at a time: `start()` listens, the live words arrive as `heard`, and the final
 * words go to `onFinal` once. `stop()` ends it early.
 */
export function useSpeech(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [problem, setProblem] = useState<SpeechProblem | null>(null);
  const current = useRef<Recognizer | null>(null);
  const final = useRef(onFinal);
  final.current = onFinal;

  const listen = useCallback((lang: (typeof LANGUAGES)[number]) => {
    const Recognition = recognizerClass();
    if (!Recognition) return;
    const rec = new Recognition();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let done = false;
    let fellBack = false;
    rec.onresult = (event) => {
      let text = "";
      let isFinal = false;
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        text += result?.[0]?.transcript ?? "";
        if (result?.isFinal) isFinal = true;
      }
      setHeard(text);
      if (isFinal && !done) {
        done = true;
        final.current(text);
      }
    };
    rec.onerror = (event) => {
      if (event.error === "language-not-supported" && lang === "th-TH") {
        fellBack = true;
        listen("en-US");
        return;
      }
      if (event.error === "aborted") return;
      setProblem(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "denied"
          : event.error === "no-speech"
            ? "no-speech"
            : event.error === "network"
              ? "network"
              : "failed",
      );
    };
    rec.onend = () => {
      if (fellBack) return;
      if (current.current === rec) current.current = null;
      setListening(false);
    };
    current.current = rec;
    setListening(true);
    rec.start();
  }, []);

  const start = useCallback(() => {
    current.current?.abort();
    setHeard("");
    setProblem(null);
    try {
      listen(LANGUAGES[0]);
    } catch {
      setProblem("failed");
      setListening(false);
    }
  }, [listen]);
  const stop = useCallback(() => current.current?.stop(), []);
  useEffect(() => () => current.current?.abort(), []);
  return { listening, heard, problem, start, stop };
}

// Whether the voice sheet is open: the player page pauses its Aurora meanwhile, so only one canvas
// animates (DESIGN.md: at most one continuously animating canvas per view).
let sheetOpen = false;
const listeners = new Set<() => void>();
export function setVoiceSheetOpen(open: boolean): void {
  if (open === sheetOpen) return;
  sheetOpen = open;
  for (const listener of listeners) listener();
}
export function useVoiceSheetOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => sheetOpen,
    () => false,
  );
}
