"use client";

import type { DiscordMessage } from "@narze/shared";
import { type ReactNode, useState } from "react";
import styles from "./channel.module.css";

/**
 * Discord markdown as React nodes (spec #111): code blocks, inline code, bold, italic, underline,
 * strike, spoilers, quotes, headers, links, and mentions. Text only ever becomes text nodes; a link
 * is drawn only for http(s) URLs, so a message cannot inject markup or a javascript: link.
 */
export function DiscordText({
  text,
  message,
}: {
  text: string;
  message: Pick<DiscordMessage, "mentions" | "mentionedRoles">;
}) {
  const users = new Map(message.mentions.map((m) => [m.id, m.name]));
  const roles = new Map(message.mentionedRoles.map((r) => [r.id, r]));
  return <>{blocks(text, { users, roles })}</>;
}

type Names = {
  users: Map<string, string>;
  roles: Map<string, DiscordMessage["mentionedRoles"][number]>;
};

/** Code fences first (their contents are never parsed), then line-level quotes and headers. */
function blocks(text: string, names: Names): ReactNode[] {
  const out: ReactNode[] = [];
  const fence = /```(?:[\w+-]*\n)?([\s\S]*?)```/g;
  let at = 0;
  for (const match of text.matchAll(fence)) {
    if (match.index > at) out.push(...lines(text.slice(at, match.index), names, out.length));
    out.push(
      <pre key={`f${out.length}`} className={styles.codeBlock}>
        <code>{match[1]}</code>
      </pre>,
    );
    at = match.index + match[0].length;
  }
  if (at < text.length) out.push(...lines(text.slice(at), names, out.length));
  return out;
}

function lines(text: string, names: Names, base: number): ReactNode[] {
  return text.split("\n").map((line, i) => {
    const key = `l${base}-${i}`;
    const heading = /^(#{1,3}) (.+)$/.exec(line);
    if (heading?.[1] && heading[2]) {
      const Tag = (["h3", "h4", "h5"] as const)[heading[1].length - 1] ?? "h5";
      return (
        <Tag key={key} className={styles.mdHeading}>
          {inline(heading[2], names)}
        </Tag>
      );
    }
    const quote = /^> ?(.*)$/.exec(line);
    if (quote) {
      return (
        <blockquote key={key} className={styles.quote}>
          {inline(quote[1] ?? "", names)}
        </blockquote>
      );
    }
    return (
      <span key={key} className={styles.line}>
        {inline(line, names)}
        {"\n"}
      </span>
    );
  });
}

/** One pass, leftmost match wins; each rule renders its inside with the same rules (except code). */
const RULES: Array<{ re: RegExp; draw: (m: RegExpExecArray, names: Names, key: string) => ReactNode }> = [
  {
    re: /`([^`\n]+)`/,
    draw: (m, _n, key) => (
      <code key={key} className={styles.code}>
        {m[1]}
      </code>
    ),
  },
  { re: /\*\*([\s\S]+?)\*\*/, draw: (m, n, key) => <strong key={key}>{inline(m[1] ?? "", n)}</strong> },
  { re: /__([\s\S]+?)__/, draw: (m, n, key) => <u key={key}>{inline(m[1] ?? "", n)}</u> },
  { re: /\*([^*\n]+?)\*/, draw: (m, n, key) => <em key={key}>{inline(m[1] ?? "", n)}</em> },
  { re: /\b_([^_\n]+?)_\b/, draw: (m, n, key) => <em key={key}>{inline(m[1] ?? "", n)}</em> },
  { re: /~~([\s\S]+?)~~/, draw: (m, n, key) => <s key={key}>{inline(m[1] ?? "", n)}</s> },
  {
    re: /\|\|([\s\S]+?)\|\|/,
    draw: (m, n, key) => <Spoiler key={key}>{inline(m[1] ?? "", n)}</Spoiler>,
  },
  {
    re: /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/,
    draw: (m, _n, key) => (
      <a key={key} href={m[2]} target="_blank" rel="noopener noreferrer">
        {m[1]}
      </a>
    ),
  },
  {
    re: /https?:\/\/[^\s<]+[^\s<.,:;"')\]]/,
    draw: (m, _n, key) => (
      <a key={key} href={m[0]} target="_blank" rel="noopener noreferrer">
        {m[0]}
      </a>
    ),
  },
  {
    re: /<@!?(\d+)>/,
    draw: (m, n, key) => (
      <span key={key} className={styles.mention}>
        @{n.users.get(m[1] ?? "") ?? "ผู้ใช้"}
      </span>
    ),
  },
  {
    re: /<@&(\d+)>/,
    draw: (m, n, key) => {
      const role = n.roles.get(m[1] ?? "");
      return (
        <span key={key} className={styles.mention} style={role?.color ? { color: role.color } : undefined}>
          @{role?.name ?? "role"}
        </span>
      );
    },
  },
  {
    re: /<#(\d+)>/,
    draw: (_m, _n, key) => (
      <span key={key} className={styles.mention}>
        #ช่อง
      </span>
    ),
  },
  {
    re: /<a?:(\w+):\d+>/,
    draw: (m, _n, key) => (
      <span key={key} className={styles.emoji}>
        :{m[1]}:
      </span>
    ),
  },
];

export function inline(text: string, names: Names): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  while (rest) {
    let best: { m: RegExpExecArray; rule: (typeof RULES)[number] } | null = null;
    for (const rule of RULES) {
      const m = rule.re.exec(rest);
      if (m && (!best || m.index < best.m.index)) best = { m, rule };
    }
    if (!best) {
      out.push(rest);
      break;
    }
    if (best.m.index > 0) out.push(rest.slice(0, best.m.index));
    out.push(best.rule.draw(best.m, names, `i${out.length}`));
    rest = rest.slice(best.m.index + best.m[0].length);
  }
  return out;
}

/** ||spoiler||: hidden until pressed, as in Discord. */
function Spoiler({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  return shown ? (
    <span className={styles.spoilerShown}>{children}</span>
  ) : (
    <button type="button" className={styles.spoiler} onClick={() => setShown(true)} aria-label="สปอยเลอร์ กดเพื่อดู">
      {children}
    </button>
  );
}
