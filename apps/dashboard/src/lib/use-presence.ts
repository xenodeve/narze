"use client";

import { useEffect, useState } from "react";

/** The shared dialog exit in base.css lasts 200 ms; a little more so it always completes. */
const EXIT_MS = 240;

/**
 * Keeps something on screen a moment after it goes away, so its exit can play (#174). `value` is
 * the latest non-null value, kept for EXIT_MS after the input turns null; `open` is the input's
 * own truth, for the thing to start closing at once.
 */
export function usePresence<T>(input: T | null, ms = EXIT_MS): { value: T | null; open: boolean } {
  const [kept, setKept] = useState<T | null>(input);
  useEffect(() => {
    if (input !== null) {
      setKept(input);
      return;
    }
    const timer = setTimeout(() => setKept(null), ms);
    return () => clearTimeout(timer);
  }, [input, ms]);
  return { value: input ?? kept, open: input !== null };
}
