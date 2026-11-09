"use client";

import { isAtLeast } from "@narze/shared";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Account } from "@/components/account";
import { GuildIcon } from "@/components/guild-icon";
import BranchedMenu from "@/components/vendor/branched-menu/BranchedMenu";
import { VoiceControl } from "@/components/voice";
import { useAdminRole } from "@/lib/admin";
import { useSession } from "@/lib/session";
import { useGuilds } from "@/lib/use-guilds";
import styles from "./app-shell.module.css";

const HOME = "home";
const SEARCH = "search";
const LIBRARY = "library";
const SESSIONS = "sessions";
const ADMIN = "admin";
const ROUTES: Record<string, string> = {
  [ADMIN]: "/admin",
  [HOME]: "/",
  [SEARCH]: "/search",
  [LIBRARY]: "/library",
  [SESSIONS]: "/sessions",
};

/** The sidebar row for a path: the Guild, or the top-level page the path is under. */
function currentItem(pathname: string, guildId: string): string {
  if (guildId) return guildId;
  const top = Object.entries(ROUTES).find(([, path]) => path !== "/" && pathname.startsWith(path));
  return top ? top[0] : HOME;
}

function GuildNav({ userId, activeGuildId }: { userId: string; activeGuildId: string }) {
  const router = useRouter();
  const view = useGuilds(userId);
  const guilds = view.status === "ready" ? view.guilds : [];
  // The admin area is listed for Admins only (#110); the Backend refuses everyone else anyway.
  const role = useAdminRole();
  const isAdmin = role !== "loading" && isAtLeast(role, "admin");
  // BranchedMenu reads its items and active row once. It marks its own picks (and glides there),
  // so it is remounted only when the page changes some other way: Back, Forward, or a link in the
  // content (#168, #172). A remount after its own pick would cut the glide short.
  const current = currentItem(usePathname(), activeGuildId);
  const shown = useRef(current);
  const [moves, setMoves] = useState(0);
  useEffect(() => {
    if (current === shown.current) return;
    shown.current = current;
    setMoves((n) => n + 1);
  }, [current]);
  const key = `${guilds.map((g) => g.id).join(",")}|${isAdmin}|${moves}`;
  const items = [
    { label: "หน้าแรก", value: HOME },
    { label: "ค้นหา", value: SEARCH },
    { label: "คลังเพลง", value: LIBRARY },
    { label: "ประวัติการฟัง", value: SESSIONS },
    ...(isAdmin ? [{ label: "แอดมิน", value: ADMIN }] : []),
    {
      label: "เซิร์ฟเวอร์",
      children: guilds.map((g) => ({
        value: g.id,
        label: g.name,
        icon: (
          <GuildIcon
            guildId={g.id}
            name={g.name}
            iconUrl={g.iconUrl}
            size={20}
            testId="nav-guild-icon"
            monogramTestId="nav-monogram"
          />
        ),
      })),
    },
  ];
  return (
    <BranchedMenu
      key={key}
      items={items}
      // The servers group, wherever the items above leave it.
      defaultOpen={items.findIndex((item) => "children" in item)}
      // What the menu last meant to show: a remount while its own pick is in flight (the guild
      // list arriving) keeps that pick instead of snapping back to the page being left.
      defaultActive={shown.current}
      onSelect={(value) => {
        shown.current = value;
        router.push(ROUTES[value] ?? `/guilds/${value}`);
      }}
      color="var(--ink-2)"
      accentColor="var(--ink)"
      lineColor="var(--line)"
      width={216}
    />
  );
}

/**
 * App shell (#76, DESIGN.md §5): a sticky glass top bar and a 240px sticky sidebar with the supplied
 * BranchedMenu listing the user's servers. At ≤ 900px the sidebar folds into a <details>. The
 * (app) layout renders it once, so it lives across page changes (#168).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const session = useSession();
  // Rendered once by the (app) layout (#168), so the Guild comes from the path, not from a page.
  const pathname = usePathname();
  const guildId = /^\/guilds\/([^/]+)/.exec(pathname)?.[1] ?? "";
  // Open beside the content on wide screens; folded on narrow ones so the player comes first. The
  // shell outlives the page (#168), so on a narrow screen a pick folds the menu again.
  const [open, setOpen] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-evaluated on every page change, by design
  useEffect(() => setOpen(window.matchMedia("(min-width: 901px)").matches), [pathname]);
  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <Link className={`mono ${styles.brand}`} href="/">
          NARZE · V7
        </Link>
        <span className={styles.barEnd}>
          {guildId && session.status === "signed-in" ? <VoiceControl key={guildId} guildId={guildId} /> : null}
          <Account />
        </span>
      </header>
      {/* Signed out there is no sidebar, so the content takes the whole width (#172). While the
          session loads, the sidebar's column stays reserved so the content does not jump. */}
      <div className={styles.body} data-sidebar={session.status === "signed-out" ? "none" : undefined}>
        {session.status === "signed-in" ? (
          <details className={styles.side} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
            <summary className={styles.sideToggle}>เมนู</summary>
            <nav aria-label="เซิร์ฟเวอร์ของคุณ" className={styles.nav}>
              <GuildNav userId={session.userId} activeGuildId={guildId} />
            </nav>
          </details>
        ) : null}
        <main className={styles.content}>
          {/* Keyed by the path, so every page change (a new server included) enters with DESIGN.md's
              `page` motion; a search-param change (a tab) does not replay it (#172). */}
          <div key={pathname} className={styles.page} data-testid="page">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
