"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { Account } from "@/components/account";
import { GuildAvatar } from "@/components/guild-avatar";
import BranchedMenu from "@/components/vendor/branched-menu/BranchedMenu";
import { useSession } from "@/lib/session";
import { useGuilds } from "@/lib/use-guilds";
import styles from "./app-shell.module.css";

const HOME = "home";
const SEARCH = "search";

function GuildNav({ userId, activeGuildId }: { userId: string; activeGuildId: string }) {
  const router = useRouter();
  const view = useGuilds(userId);
  const guilds = view.status === "ready" ? view.guilds : [];
  // Remount when the list arrives: BranchedMenu reads its items and active row once.
  const key = guilds.map((g) => g.id).join(",");
  return (
    <BranchedMenu
      key={key}
      items={[
        { label: "หน้าแรก", value: HOME },
        { label: "ค้นหา", value: SEARCH },
        {
          label: "เซิร์ฟเวอร์",
          children: guilds.map((g) => ({
            value: g.id,
            label: g.name,
            // The Guild's Bot Avatar in its outfit (#106); a monogram until the Bot has its settings.
            icon: g.avatar ? (
              <GuildAvatar outfit={g.avatar} size={20} testId="nav-avatar" guildId={g.id} />
            ) : (
              <span className={styles.monogram} aria-hidden="true">
                {Array.from(g.name)[0] ?? "?"}
              </span>
            ),
          })),
        },
      ]}
      defaultOpen={1}
      defaultActive={activeGuildId}
      onSelect={(value) => router.push(value === HOME ? "/" : value === SEARCH ? "/search" : `/guilds/${value}`)}
      color="var(--ink-2)"
      accentColor="var(--ink)"
      lineColor="var(--line)"
      width={216}
    />
  );
}

/**
 * App shell (#76, DESIGN.md §5): a sticky glass top bar and a 240px sticky sidebar with the supplied
 * BranchedMenu listing the user's servers. At ≤ 900px the sidebar folds into a <details>.
 */
export function AppShell({ guildId = "", children }: { guildId?: string; children: ReactNode }) {
  const session = useSession();
  // Open beside the content on wide screens; folded on narrow ones so the player comes first.
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(window.matchMedia("(min-width: 901px)").matches), []);
  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <a className={`mono ${styles.brand}`} href="/">
          NARZE · V7
        </a>
        <Account />
      </header>
      <div className={styles.body}>
        {session.status === "signed-in" ? (
          <details className={styles.side} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
            <summary className={styles.sideToggle}>เมนู</summary>
            <nav aria-label="เซิร์ฟเวอร์ของคุณ" className={styles.nav}>
              <GuildNav userId={session.userId} activeGuildId={guildId} />
            </nav>
          </details>
        ) : null}
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
