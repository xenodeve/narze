"use client";

import { type GuildSummary, isAtLeast } from "@narze/shared";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { Account } from "@/components/account";
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

/**
 * The server's own Discord icon in the sidebar (#166): a rounded square. A server without an icon,
 * or one the CDN cannot serve, shows its monogram instead of an empty gap.
 */
function NavGuildIcon({ guild }: { guild: Pick<GuildSummary, "id" | "name" | "iconUrl"> }) {
  const [broken, setBroken] = useState(false);
  if (guild.iconUrl && !broken) {
    return (
      // biome-ignore lint/performance/noImgElement: a 20px guild icon from Discord's CDN; next/image would add remote-pattern config for no gain
      <img
        className={styles.guildIcon}
        src={guild.iconUrl}
        width={20}
        height={20}
        alt=""
        onError={() => setBroken(true)}
        data-testid="nav-guild-icon"
        data-guild-id={guild.id}
      />
    );
  }
  return (
    <span className={styles.monogram} aria-hidden="true" data-testid="nav-monogram" data-guild-id={guild.id}>
      {Array.from(guild.name)[0] ?? "?"}
    </span>
  );
}

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
  // Remount when the list arrives or the page changes: BranchedMenu reads its items and active row
  // once, and the shell now outlives the page (#168), so Back or a content link must re-mark it.
  const current = currentItem(usePathname(), activeGuildId);
  const key = `${guilds.map((g) => g.id).join(",")}|${isAdmin}|${current}`;
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
        icon: <NavGuildIcon guild={g} />,
      })),
    },
  ];
  return (
    <BranchedMenu
      key={key}
      items={items}
      // The servers group, wherever the items above leave it.
      defaultOpen={items.findIndex((item) => "children" in item)}
      defaultActive={current}
      onSelect={(value) => router.push(ROUTES[value] ?? `/guilds/${value}`)}
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
