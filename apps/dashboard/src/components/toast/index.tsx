"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useEffect } from "react";
import styles from "./toast.module.css";

const EASE = [0.23, 1, 0.32, 1] as const;
/** Long enough to read a short Thai sentence twice. */
const SHOWN_MS = 3200;

/**
 * A short confirmation that floats above the page and leaves on its own (#174). The live region is
 * always in the DOM, so a screen reader hears each message; a new message re-enters.
 */
export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDone, SHOWN_MS);
    return () => clearTimeout(timer);
  }, [message, onDone]);
  return (
    <div className={styles.region} role="status" aria-live="polite">
      <MotionConfig reducedMotion="user">
        <AnimatePresence>
          {message ? (
            <motion.p
              key={message}
              className={styles.toast}
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.98 }}
              transition={{ duration: 0.24, ease: EASE }}
            >
              {message}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </MotionConfig>
    </div>
  );
}
