"use client";

import { AVATAR_GLASSES, AVATAR_HATS, AVATAR_TYPES, type AvatarOutfit, type SettingsUpdate } from "@narze/shared";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Thinking } from "@/components/catalog/thinking";
import { GuildAvatar } from "@/components/guild-avatar";
import { useSession } from "@/lib/session";
import { type SettingsView, saveSettings, useGuildSettings } from "@/lib/settings";
import styles from "./settings.module.css";

// The supplied SquishSwitch for guild setting toggles (DESIGN.md), sized 38×22 to match Strata.
const SquishSwitch = dynamic(() => import("@/components/vendor/squish-switch/SquishSwitch"), { ssr: false });

const HAT_TH: Record<(typeof AVATAR_HATS)[number], string> = {
  none: "ไม่ใส่",
  beret: "เบเรต์",
  beanie: "หมวกไหมพรม",
  party: "หมวกปาร์ตี้",
  crown: "มงกุฎ",
};
const GLASSES_TH: Record<(typeof AVATAR_GLASSES)[number], string> = {
  none: "ไม่ใส่",
  round: "กลม",
  square: "เหลี่ยม",
  shades: "แว่นกันแดด",
};

/** Guild Settings (#106, spec #92). */
export function GuildSettingsPage({ guildId }: { guildId: string }) {
  const session = useSession();
  if (session.status === "loading") return null;
  if (session.status === "signed-out") return <p role="status">เข้าสู่ระบบด้วย Discord ก่อน แล้วจะเห็นการตั้งค่า</p>;
  return <SettingsBody guildId={guildId} />;
}

function SettingsBody({ guildId }: { guildId: string }) {
  const [state, setView] = useGuildSettings(guildId);
  if (state.status === "loading") return <Thinking label="กำลังโหลดการตั้งค่า" />;
  if (state.status === "missing") return <p role="status">บอทยังไม่เคยเห็นเซิร์ฟเวอร์นี้ เชิญบอทเข้าเซิร์ฟเวอร์ก่อน</p>;
  if (state.status === "failed") return <p role="alert">โหลดการตั้งค่าไม่ได้ ลองรีเฟรช</p>;
  const { view } = state;
  const save = async (change: SettingsUpdate) => {
    const result = await saveSettings(guildId, change);
    if ("error" in result) return result.error;
    setView(result);
    return null;
  };
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>ตั้งค่าเซิร์ฟเวอร์</h1>
      <p className={styles.explain}>
        เจ้าของเซิร์ฟเวอร์และ Bot Owner (คนที่เชิญบอท) ควบคุมเพลงได้จากทุกที่และเปลี่ยนการตั้งค่าได้ สมาชิกคนอื่นควบคุมได้เมื่ออยู่ห้องเสียงเดียวกับบอท
        หรือเริ่มเล่นเพลงในห้องที่ตัวเองอยู่
      </p>
      {view.canEdit ? null : (
        <p role="note" className={styles.locked}>
          เฉพาะเจ้าของเซิร์ฟเวอร์หรือ Bot Owner ที่เปลี่ยนการตั้งค่าได้
        </p>
      )}
      <BotOwner ownerId={view.settings.ownerId} />
      <MusicChannel view={view} onSave={save} />
      <Outfit view={view} onSave={save} />
    </div>
  );
}

function BotOwner({ ownerId }: { ownerId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <section className={styles.section} aria-labelledby="owner-title">
      <h2 id="owner-title" className={styles.heading}>
        Bot Owner
      </h2>
      <div className={styles.owner}>
        <code className="mono">{ownerId}</code>
        <button
          type="button"
          className={styles.ghost}
          onClick={() => {
            void navigator.clipboard?.writeText(ownerId).then(() => setCopied(true));
          }}
        >
          {copied ? "คัดลอกแล้ว" : "คัดลอก ID"}
        </button>
      </div>
    </section>
  );
}

function useStatus() {
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  return {
    status,
    report: (error: string | null) => setStatus(error ? { ok: false, text: error } : { ok: true, text: "บันทึกแล้ว" }),
  };
}

function MusicChannel({ view, onSave }: { view: SettingsView; onSave: (c: SettingsUpdate) => Promise<string | null> }) {
  const saved = view.settings.musicChannelId;
  const [choice, setChoice] = useState<string | null>(saved);
  const [filter, setFilter] = useState("");
  const { status, report } = useStatus();
  // A change saved elsewhere (another tab, /setchannel) moves the selection with it.
  useEffect(() => setChoice(saved), [saved]);
  const shown = view.textChannels.filter((c) => c.name.toLowerCase().includes(filter.trim().toLowerCase()));
  return (
    <section className={styles.section} aria-labelledby="channel-title">
      <h2 id="channel-title" className={styles.heading}>
        Music Channel
      </h2>
      <p className={styles.note}>
        ห้องที่บอทประกาศเพลงที่กำลังเล่นและการกู้คิว ถ้าไม่เลือก บอทจะประกาศในห้องที่ใช้คำสั่ง (หรือห้องข้อความแรกที่บอทส่งได้ ถ้าเริ่มเล่นจาก
        Dashboard)
      </p>
      <input
        type="search"
        className={styles.field}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        aria-label="ค้นหาห้องข้อความ"
        placeholder="ค้นหาห้อง"
        disabled={!view.canEdit}
      />
      <fieldset className={styles.channels} disabled={!view.canEdit}>
        <legend className="sr-only">เลือก Music Channel</legend>
        <label className={styles.channel}>
          <input type="radio" name="music-channel" checked={choice === null} onChange={() => setChoice(null)} />
          ไม่เลือก (ห้องที่ใช้คำสั่ง)
        </label>
        {shown.map((c) => (
          <label key={c.id} className={styles.channel}>
            <input type="radio" name="music-channel" checked={choice === c.id} onChange={() => setChoice(c.id)} />
            {`# ${c.name}`}
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        className={styles.primary}
        disabled={!view.canEdit || choice === saved}
        onClick={async () => report(await onSave({ musicChannelId: choice }))}
      >
        บันทึก Music Channel
      </button>
      {status ? (
        <p role="status" className={status.ok ? styles.ok : styles.error}>
          {status.text}
        </p>
      ) : null}
    </section>
  );
}

function Outfit({ view, onSave }: { view: SettingsView; onSave: (c: SettingsUpdate) => Promise<string | null> }) {
  const saved = view.settings.avatar;
  const [outfit, setOutfit] = useState<AvatarOutfit>(saved);
  const { status, report } = useStatus();
  useEffect(() => setOutfit(saved), [saved]);
  const set = <K extends keyof AvatarOutfit>(key: K, value: AvatarOutfit[K]) =>
    setOutfit((o) => ({ ...o, [key]: value }));
  return (
    <section className={styles.section} aria-labelledby="outfit-title">
      <h2 id="outfit-title" className={styles.heading}>
        ชุดของ Bot Avatar
      </h2>
      <div className={styles.outfit}>
        <GuildAvatar outfit={outfit} size={96} testId="outfit-preview" />
        <fieldset className={styles.controls} disabled={!view.canEdit}>
          <legend className="sr-only">ชุดของ Bot Avatar</legend>
          <label className={styles.control}>
            ชนิด
            <select value={outfit.type} onChange={(e) => set("type", e.target.value as AvatarOutfit["type"])}>
              {AVATAR_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.control}>
            หมวก
            <select value={outfit.hat} onChange={(e) => set("hat", e.target.value as AvatarOutfit["hat"])}>
              {AVATAR_HATS.map((h) => (
                <option key={h} value={h}>
                  {HAT_TH[h]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.control}>
            แว่น
            <select value={outfit.glasses} onChange={(e) => set("glasses", e.target.value as AvatarOutfit["glasses"])}>
              {AVATAR_GLASSES.map((g) => (
                <option key={g} value={g}>
                  {GLASSES_TH[g]}
                </option>
              ))}
            </select>
          </label>
          <span className={styles.check}>
            <SquishSwitch
              checked={outfit.headphones}
              onChange={(on: boolean) => set("headphones", on)}
              disabled={!view.canEdit}
              ariaLabel="หูฟัง"
              width={38}
              height={22}
              radius={11}
              trackColor="var(--fill)"
              trackOnColor="var(--accent)"
            />
            หูฟัง
          </span>
          <span className={styles.check}>
            <SquishSwitch
              checked={outfit.bowTie}
              onChange={(on: boolean) => set("bowTie", on)}
              disabled={!view.canEdit}
              ariaLabel="โบว์ไท"
              width={38}
              height={22}
              radius={11}
              trackColor="var(--fill)"
              trackOnColor="var(--accent)"
            />
            โบว์ไท
          </span>
          <label className={styles.control}>
            สีเครื่องประดับ
            <input type="color" value={outfit.accessoryColor} onChange={(e) => set("accessoryColor", e.target.value)} />
          </label>
        </fieldset>
      </div>
      <button
        type="button"
        className={styles.primary}
        disabled={!view.canEdit}
        onClick={async () => report(await onSave({ avatar: outfit }))}
      >
        บันทึกชุด
      </button>
      {status ? (
        <p role="status" className={status.ok ? styles.ok : styles.error}>
          {status.text}
        </p>
      ) : null}
    </section>
  );
}
