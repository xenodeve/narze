"use client";

import { CHART_SHOWN, type Chart, type ChartEntry, type ChartRegion, ChartSchema } from "@narze/shared";
import { useEffect, useId, useRef, useState } from "react";
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

const updatedOn = (ms: number) => new Date(ms).toLocaleDateString("th-TH", { day: "numeric", month: "short" });

const MOVES: Record<NonNullable<ChartEntry["movement"]>, { mark: string; label: string }> = {
  up: { mark: "▲", label: "ขึ้น" },
  down: { mark: "▼", label: "ลง" },
  same: { mark: "–", label: "เท่าเดิม" },
  new: { mark: "ใหม่", label: "เข้าชาร์ตใหม่" },
};

function Movement({ entry }: { entry: ChartEntry }) {
  if (!entry.movement) return <span className={styles.move} aria-hidden="true" />;
  const move = MOVES[entry.movement];
  const from = entry.previousRank ? ` จากอันดับ ${entry.previousRank}` : "";
  // Thai stays out of the mono face (DESIGN.md rule 4): only the arrows are mono.
  return (
    <span
      className={entry.movement === "new" ? styles.move : `mono ${styles.move}`}
      data-move={entry.movement}
      title={`${move.label}${from} เทียบกับรอบอัปเดตก่อน`}
    >
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
  // Read through a ref: storing an answer must not re-run the fetch (#161, a refetch loop on 503).
  const kept = useRef(charts);
  kept.current = charts;
  useEffect(() => {
    setMessage(null);
    // A chart is kept for the visit; "unavailable" is not, so coming back to the tab tries again.
    const have = kept.current[region];
    if (have && have !== "unavailable") return;
    let current = true;
    void getChart(region).then((c) => current && setCharts((all) => ({ ...all, [region]: c })));
    return () => {
      current = false;
    };
  }, [region]);
  const play = async (entry: ChartEntry) => {
    setMessage(null);
    // The exact Spotify track when we know it; otherwise the words, like a typed play.
    const result = await playInGuild(guildId, entry.spotifyUrl ?? `${entry.title} ${entry.artist}`);
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
            {chart.entries.slice(0, CHART_SHOWN).map((entry) => (
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
          <p className={styles.source}>
            <span className="mono">Apple Music · {chart.title}</span>
            {chart.stale ? ` · แหล่งข้อมูลไม่ตอบ แสดงชุดเมื่อ ${updatedOn(chart.fetchedAt)}` : ""}
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
