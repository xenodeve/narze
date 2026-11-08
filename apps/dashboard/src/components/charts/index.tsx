"use client";

import { type Chart, type ChartEntry, type ChartRegion, ChartSchema } from "@narze/shared";
import { useEffect, useId, useState } from "react";
import { answer, apiGet, parsed } from "@/lib/api";
import { playInGuild } from "@/lib/control";
import pill from "@/styles/pill-tabs.module.css";
import styles from "./charts.module.css";

const REGIONS: Array<{ value: ChartRegion; label: string }> = [
  { value: "th", label: "ไทย" },
  { value: "us", label: "สหรัฐฯ" },
];

/** The chart, or "unavailable" when the Backend has none to give (ADR-0010: never made up). */
async function getChart(region: ChartRegion): Promise<Chart | "unavailable"> {
  return (await parsed<Chart>(await answer(apiGet(`/api/charts/${region}`)), ChartSchema)) ?? "unavailable";
}

const MOVES: Record<NonNullable<ChartEntry["movement"]>, { mark: string; label: string }> = {
  up: { mark: "▲", label: "ขึ้น" },
  down: { mark: "▼", label: "ลง" },
  same: { mark: "–", label: "เท่าเดิม" },
  new: { mark: "ใหม่", label: "เข้าใหม่" },
};

function Movement({ entry }: { entry: ChartEntry }) {
  if (!entry.movement) return <span className={styles.move} aria-hidden="true" />;
  const move = MOVES[entry.movement];
  const from = entry.previousRank ? ` จากอันดับ ${entry.previousRank}` : "";
  return (
    <span className={`mono ${styles.move}`} data-move={entry.movement} title={`${move.label}${from}`}>
      {move.mark}
    </span>
  );
}

/** Spec #53, #72, #117: the chart on the idle guild page; a song is a click away from playing here. */
export function ChartPanel({ guildId }: { guildId: string }) {
  const id = useId();
  const [region, setRegion] = useState<ChartRegion>("th");
  // Each region's chart is kept for the visit: switching tabs back shows it at once.
  const [charts, setCharts] = useState<Partial<Record<ChartRegion, Chart | "unavailable">>>({});
  const chart = charts[region] ?? null;
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    setMessage(null);
    if (charts[region]) return;
    let current = true;
    void getChart(region).then((c) => current && setCharts((all) => ({ ...all, [region]: c })));
    return () => {
      current = false;
    };
  }, [region, charts]);
  const play = async (entry: ChartEntry) => {
    setMessage(null);
    const result = await playInGuild(guildId, `${entry.title} ${entry.artist}`);
    setMessage(result.ok ? `เพิ่ม ${entry.title} แล้ว` : result.text);
  };
  return (
    <section className={styles.panel} aria-labelledby={id}>
      <div className={styles.head}>
        <h2 id={id} className={styles.heading}>
          ชาร์ตเพลง
        </h2>
        <div role="tablist" aria-label="ประเทศ" className={pill.tabs}>
          {REGIONS.map((r) => (
            <button
              key={r.value}
              type="button"
              role="tab"
              aria-selected={region === r.value}
              className={pill.tab}
              onClick={() => setRegion(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {chart === null ? null : chart === "unavailable" ? (
        <p role="status" className={styles.meta}>
          ชาร์ตนี้ยังโหลดไม่ได้ แหล่งข้อมูลไม่ตอบ ลองใหม่ภายหลัง
        </p>
      ) : (
        <>
          <ol className={styles.rows}>
            {chart.entries.slice(0, 10).map((entry) => (
              <li key={entry.rank} className={styles.row} data-testid="chart-entry">
                <span className={`num ${styles.rank}`}>{entry.rank}</span>
                <Movement entry={entry} />
                {entry.artwork ? (
                  // biome-ignore lint/performance/noImgElement: 40px chart artwork from Apple's CDN
                  <img className={styles.art} src={entry.artwork} alt="" width={40} height={40} loading="lazy" />
                ) : (
                  <span className={styles.art} aria-hidden="true" />
                )}
                <span className={styles.text}>
                  <span className={styles.title}>{entry.title}</span>
                  <span className={styles.meta}>{entry.artist}</span>
                </span>
                <button
                  type="button"
                  className={styles.play}
                  onClick={() => void play(entry)}
                  aria-label={`เล่น ${entry.title} จากชาร์ต`}
                >
                  ▶
                </button>
              </li>
            ))}
          </ol>
          <p className={`mono ${styles.source}`}>
            Apple Music · {chart.title}
            {chart.stale ? " · แหล่งข้อมูลไม่ตอบ แสดงชุดล่าสุดที่มี" : ""}
          </p>
        </>
      )}
      {message ? (
        <p role="status" aria-live="polite" className={styles.meta}>
          {message}
        </p>
      ) : null}
    </section>
  );
}
