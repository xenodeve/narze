"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { canAnimate } from "@/lib/motion";
import styles from "./mood-aurora.module.css";

const Aurora = dynamic(() => import("@/components/vendor/aurora/Aurora"), { ssr: false });

/** The one ambient canvas on the player page, coloured from the mood; behind the stage, never in front. */
export function MoodAurora({ mood, paused }: { mood: string; paused: boolean }) {
  const [animate, setAnimate] = useState(false);
  useEffect(() => setAnimate(canAnimate()), []);

  return (
    <div className={styles.layer} aria-hidden="true" data-fx={animate ? "aurora" : "wash"} data-paused={paused}>
      {animate ? (
        <Aurora colorStops={[mood, "#5aa2ff", mood]} amplitude={0.9} blend={0.6} speed={0.6} paused={paused} />
      ) : (
        <div className={styles.wash} />
      )}
    </div>
  );
}
