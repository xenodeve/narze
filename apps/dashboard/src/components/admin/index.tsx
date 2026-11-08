"use client";

import type { AdminRole, AdminStats } from "@narze/shared";
import { isAtLeast, STATS_POINTS } from "@narze/shared";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Thinking } from "@/components/catalog/thinking";
import { getStats, useAdminRole, useAdminRoom } from "@/lib/admin";
import { duration } from "@/lib/history";
import { useSession } from "@/lib/session";
import styles from "./admin.module.css";

// The supplied SloshGauge (DESIGN.md): read-only CPU / memory meters here.
const SloshGauge = dynamic(() => import("@/components/vendor/slosh-gauge/SloshGauge"), { ssr: false });

/**
 * The admin area's gate (#110, spec #97): signed out sees the sign-in prompt; signed in but not on
 * the whitelist is sent home (the Backend refuses every admin call anyway).
 */
export function AdminArea({
  needs = "admin",
  children,
}: {
  needs?: AdminRole;
  children: (role: AdminRole) => ReactNode;
}) {
  const session = useSession();
  const role = useAdminRole();
  const router = useRouter();
  const allowed = role !== "loading" && isAtLeast(role, needs);
  useEffect(() => {
    if (session.status === "signed-in" && role !== "loading" && !allowed) router.replace("/");
  }, [session.status, role, allowed, router]);
  if (session.status === "signed-out") return <p role="status">เข้าสู่ระบบด้วย Discord ก่อน</p>;
  if (role === "loading" || !allowed) return null;
  return (
    <div className={styles.page}>
      <AdminNav role={role as AdminRole} />
      {children(role as AdminRole)}
    </div>
  );
}

function AdminNav({ role }: { role: AdminRole }) {
  const path = usePathname();
  const links = [
    { href: "/admin", label: "ภาพรวม" },
    { href: "/admin/logs", label: "Log สด" },
    ...(role === "developer" ? [{ href: "/admin/settings", label: "ตั้งค่า" }] : []),
  ];
  return (
    <nav aria-label="แอดมิน" className={styles.subnav}>
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={styles.subLink} aria-current={path === l.href ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

const gb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;
const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

/** A hex colour from a CSS token, for the SloshGauge (it computes its text colour from hex). */
function useTokenHex(name: string, fallback: string): string {
  const [hex, setHex] = useState(fallback);
  useEffect(() => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (/^#[0-9a-f]{3,8}$/i.test(value)) setHex(value);
  }, [name]);
  return hex;
}

function Card({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <li className={styles.card} data-testid="admin-card">
      <span className={styles.cardLabel}>{label}</span>
      <span className={`num ${styles.cardValue}`}>{value}</span>
      {hint ? <span className={`num ${styles.hint}`}>{hint}</span> : null}
    </li>
  );
}

const memoryPercent = (s: AdminStats) => (s.memory.usedBytes / Math.max(1, s.memory.totalBytes)) * 100;

/** One measure over the last STATS_POINTS samples (5 minutes): the performance view. */
function Trend({ samples, label, value }: { samples: AdminStats[]; label: string; value: (s: AdminStats) => number }) {
  const points = samples.slice(-STATS_POINTS);
  if (points.length < 2) return null;
  const top = Math.max(10, ...points.map(value));
  const path = points
    .map((s, i) => `${((i / (STATS_POINTS - 1)) * 100).toFixed(2)},${(40 - (value(s) / top) * 38).toFixed(2)}`)
    .join(" ");
  return (
    <figure className={styles.figure}>
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className={styles.spark}
        role="img"
        aria-label={`${label} 5 นาทีล่าสุด`}
      >
        <polyline points={path} fill="none" stroke="var(--accent)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className={styles.hint}>
        {label} <span className="num">{points.length}</span> ตัวอย่างล่าสุด (สูงสุด{" "}
        <span className="num">{top.toFixed(1)}%</span>)
      </figcaption>
    </figure>
  );
}

/** Spec #109: online/ping, uptime, servers, active players, CPU, memory, caches — with their window. */
export function AdminOverview() {
  return <AdminArea>{() => <Overview />}</AdminArea>;
}

/** Samples by time, one per `at`, the last STATS_POINTS: the stored ones and live ones can overlap. */
const mergeSamples = (a: AdminStats[], b: AdminStats[]) =>
  [...new Map([...a, ...b].map((s) => [s.at, s])).values()].sort((x, y) => x.at - y.at).slice(-STATS_POINTS);

/** The time now, refreshed every `everyMs`: a sample that stops arriving still ages on screen. */
function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

function Overview() {
  const [samples, setSamples] = useState<AdminStats[] | null>(null);
  const [failed, setFailed] = useState(false);
  const liquid = useTokenHex("--accent", "#0a6cff");
  const glass = useTokenHex("--surface", "#ffffff");
  const now = useNow(5000);
  useEffect(() => {
    void getStats().then((stored) => {
      if (!stored) setFailed(true);
      setSamples((live) => mergeSamples(stored?.samples ?? [], live ?? []));
    });
  }, []);
  useAdminRoom({
    onStats: useCallback((sample: AdminStats) => setSamples((all) => mergeSamples(all ?? [], [sample])), []),
  });
  if (samples === null) return <Thinking label="กำลังโหลดสถิติ" />;
  const last = samples.at(-1);
  // A Bot that stopped (or lost Redis) leaves its last sample behind; past three windows it is old news.
  const stale = last ? now - last.at > 3 * last.windowMs : false;
  return (
    <>
      <h1 className={styles.title}>ภาพรวมบอท</h1>
      {failed ? (
        <p role="alert" className={styles.error}>
          โหลดสถิติที่เก็บไว้ไม่สำเร็จ หน้านี้จะแสดงเฉพาะค่าที่เข้ามาใหม่
        </p>
      ) : null}
      {!last ? (
        <p role="status" className={styles.hint}>
          ยังไม่มีสถิติจากบอท พอบอทออนไลน์ก็จะส่งมาทุก 5 วินาที
        </p>
      ) : (
        <>
          <p className={styles.hint}>
            วัดทุก <span className="num">{Math.round(last.windowMs / 1000)}</span> วินาที · ล่าสุด{" "}
            <span className="mono num">
              {stale ? new Date(last.at).toLocaleString("th-TH") : new Date(last.at).toLocaleTimeString("th-TH")}
            </span>
          </p>
          <ul className={styles.cards}>
            <Card
              label="สถานะ"
              value={stale ? "ไม่มีข้อมูลล่าสุด" : last.online ? "ออนไลน์" : "ออฟไลน์"}
              hint={stale || last.pingMs === null ? undefined : `ping ${last.pingMs} ms`}
            />
            <Card label="ทำงานมาแล้ว" value={duration(last.uptimeMs)} />
            <Card label="เซิร์ฟเวอร์" value={last.guilds} />
            <Card label="กำลังเล่น" value={last.activePlayers} />
          </ul>
          <div className={styles.gauges}>
            <div className={styles.gauge}>
              <SloshGauge
                value={last.cpuPercent}
                ariaLabel="CPU"
                liquidColor={liquid}
                glassColor={glass}
                width={72}
                height={140}
              />
              <span className={styles.hint}>
                CPU (เฉลี่ยใน <span className="num">{Math.round(last.windowMs / 1000)}</span> วินาที)
              </span>
            </div>
            <div className={styles.gauge}>
              <SloshGauge
                value={Math.round(memoryPercent(last))}
                ariaLabel="หน่วยความจำ"
                liquidColor={liquid}
                glassColor={glass}
                width={72}
                height={140}
              />
              <span className={`num ${styles.hint}`}>
                {gb(last.memory.usedBytes)} / {gb(last.memory.totalBytes)}
              </span>
            </div>
            <Trend samples={samples} label="CPU" value={(s) => s.cpuPercent} />
            <Trend samples={samples} label="หน่วยความจำ" value={memoryPercent} />
          </div>
          <table className={styles.table}>
            <caption className={styles.hint}>Cache ของบอท</caption>
            <thead>
              <tr>
                <th scope="col">ชื่อ</th>
                <th scope="col">รายการ</th>
                <th scope="col">ขนาด</th>
              </tr>
            </thead>
            <tbody>
              {last.caches.map((c) => (
                <tr key={c.name}>
                  <td className="mono">{c.name}</td>
                  <td className="num">{c.items}</td>
                  <td className="num">{kb(c.bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
