"use client";

import { type ReactNode, useState } from "react";
import { CatalogSearch } from "@/components/catalog";
import { playInGuild } from "@/lib/control";
import pill from "@/styles/pill-tabs.module.css";
import styles from "./side-panel.module.css";

/**
 * The guild page's right column (DESIGN.md §5): Queue and Search tabs. Search here is the
 * quick-add of spec #85 — a pick goes straight into this server, so no server picker.
 */
export function SidePanel({ guildId, queue }: { guildId: string; queue: ReactNode }) {
  const [tab, setTab] = useState<"queue" | "search">("queue");
  // Search mounts the first time it is opened, then stays: switching back keeps the query (#174).
  const [searchOpened, setSearchOpened] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const add = async (item: { title: string; query: string }) => {
    setStatus(null);
    const result = await playInGuild(guildId, item.query);
    setStatus(
      result.ok ? { ok: true, text: `เพิ่ม ${item.title} แล้ว` } : { ok: false, text: result.text ?? "เพิ่มไม่สำเร็จ" },
    );
  };

  return (
    <div className={styles.panel}>
      <div role="tablist" aria-label="คิวและค้นหา" className={pill.tabs}>
        {(
          [
            ["queue", "คิว"],
            ["search", "ค้นหา"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`tab-${value}`}
            aria-selected={tab === value}
            aria-controls={`pane-${value}`}
            className={pill.tab}
            onClick={() => {
              setTab(value);
              if (value === "search") setSearchOpened(true);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div id="pane-queue" role="tabpanel" aria-labelledby="tab-queue" className={styles.pane} hidden={tab !== "queue"}>
        {queue}
      </div>
      <div
        id="pane-search"
        role="tabpanel"
        aria-labelledby="tab-search"
        className={styles.pane}
        hidden={tab !== "search"}
      >
        {searchOpened ? (
          <>
            {status ? (
              <p role="status" className={status.ok ? styles.done : styles.error}>
                {status.text}
              </p>
            ) : null}
            <CatalogSearch onPlay={(item) => void add(item)} />
          </>
        ) : null}
      </div>
    </div>
  );
}
