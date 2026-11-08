"use client";

import { type Attachment, type DiscordMessage, type Embed, MESSAGE_PAGE } from "@narze/shared";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Thinking } from "@/components/catalog/thinking";
import { getMessages, useLoad } from "@/lib/admin";
import { initial, kb, thaiDateTime } from "@/lib/format";
import styles from "./channel.module.css";
import { DiscordText } from "./discord-markdown";

/** Spec #111: the last 50 messages of a channel or thread, read-only, as Discord draws them. */
export function ChannelViewer({
  guildId,
  channelId,
  threadHref,
}: {
  guildId: string;
  channelId: string;
  threadHref: (id: string) => string;
}) {
  const page = useLoad(() => getMessages(guildId, channelId), `${guildId}:${channelId}`);
  if (page === null) return <Thinking label="กำลังโหลดข้อความ" />;
  if (page === "failed")
    return (
      <p role="alert" className={styles.empty}>
        อ่านช่องนี้ไม่ได้ บอทอาจไม่มีสิทธิ์ดูข้อความ หรือบอทไม่ได้ออนไลน์
      </p>
    );
  return (
    <section aria-label={`ข้อความใน #${page.channel.name}`} className={styles.viewer}>
      <h2 className={styles.channelName}>
        <span aria-hidden="true">#</span>
        {page.channel.name}
      </h2>
      {page.messages.length === 0 ? (
        <p className={styles.empty}>ยังไม่มีข้อความในช่องนี้</p>
      ) : (
        <ol className={styles.messages}>
          {page.messages.map((m) => (
            <Message key={m.id} message={m} threadHref={threadHref} />
          ))}
        </ol>
      )}
      <p className={`num ${styles.hint}`}>
        แสดง {page.messages.length} ข้อความล่าสุด (สูงสุด {MESSAGE_PAGE}) · อ่านอย่างเดียว
      </p>
    </section>
  );
}

function Message({ message: m, threadHref }: { message: DiscordMessage; threadHref: (id: string) => string }) {
  const [open, setOpen] = useState<Attachment | null>(null);
  return (
    <li className={styles.message} data-testid="discord-message">
      {m.author.avatarUrl ? (
        // biome-ignore lint/performance/noImgElement: Discord CDN avatars
        <img className={styles.avatar} src={m.author.avatarUrl} alt="" width={36} height={36} />
      ) : (
        <span className={styles.avatar} aria-hidden="true">
          {initial(m.author.name)}
        </span>
      )}
      <div className={styles.body}>
        {m.replyTo ? (
          <p className={styles.reply} data-testid="reply-preview">
            <span aria-hidden="true">↱</span> <strong>{m.replyTo.authorName ?? "ข้อความเก่า"}</strong>{" "}
            {m.replyTo.content || (m.replyTo.authorName ? "[ไฟล์แนบหรือ embed]" : "ไม่ได้อยู่ในหน้านี้")}
          </p>
        ) : null}
        <p className={styles.head}>
          <span className={styles.author}>{m.author.name}</span>
          {m.author.bot ? <span className={`mono ${styles.badge}`}>BOT</span> : null}
          <time className={`num ${styles.time}`} dateTime={new Date(m.at).toISOString()}>
            {thaiDateTime(m.at)}
          </time>
          {m.editedAt ? <span className={styles.time}>(แก้ไขแล้ว)</span> : null}
        </p>
        {m.content ? (
          <div className={styles.text} data-testid="message-text">
            <DiscordText text={m.content} message={m} />
          </div>
        ) : null}
        {m.attachments.length ? (
          <ul className={styles.attachments}>
            {m.attachments.map((a) => (
              <li key={a.id}>
                <AttachmentView attachment={a} onOpen={() => setOpen(a)} />
              </li>
            ))}
          </ul>
        ) : null}
        {m.embeds.map((e, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: embeds have no id; their order is fixed
          <EmbedView key={i} embed={e} message={m} />
        ))}
        {m.reactions.length ? (
          <ul className={styles.reactions} aria-label="รีแอคชัน">
            {m.reactions.map((r) => (
              <li key={r.emoji} className={styles.reaction} data-testid="reaction">
                <span>{/^\d+$/.test(r.emoji) ? "😶" : r.emoji.length > 2 ? `:${r.emoji}:` : r.emoji}</span>
                <span className="num">{r.count}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {m.thread ? (
          <Link href={threadHref(m.thread.id)} className={styles.thread} data-testid="thread-preview">
            <span className={styles.threadName}>🧵 {m.thread.name}</span>
            <span className={`num ${styles.time}`}>
              {m.thread.messageCount} ข้อความ · ล่าสุด {thaiDateTime(m.thread.lastActivityAt)}
              {m.thread.archived ? " · เก็บถาวรแล้ว" : ""}
            </span>
          </Link>
        ) : null}
      </div>
      {open ? <Lightbox attachment={open} onClose={() => setOpen(null)} /> : null}
    </li>
  );
}

function AttachmentView({ attachment: a, onOpen }: { attachment: Attachment; onOpen: () => void }) {
  const [revealed, setRevealed] = useState(!a.spoiler);
  if (!revealed) {
    return (
      <button type="button" className={styles.spoilerFile} onClick={() => setRevealed(true)}>
        สปอยเลอร์ · กดเพื่อดู {a.name}
      </button>
    );
  }
  if (a.fileType === "image") {
    return (
      <button type="button" className={styles.imageButton} onClick={onOpen} aria-label={`ดูรูป ${a.name}`}>
        {/* biome-ignore lint/performance/noImgElement: Discord CDN attachments, sizes unknown to Next */}
        <img src={a.url} alt={a.name} className={styles.image} loading="lazy" />
      </button>
    );
  }
  if (a.fileType === "video") {
    // biome-ignore lint/a11y/useMediaCaption: user uploads carry no captions
    return <video src={a.url} controls preload="metadata" className={styles.image} aria-label={a.name} />;
  }
  if (a.fileType === "audio") {
    return (
      <span className={styles.file}>
        <span>{a.name}</span>
        {/* biome-ignore lint/a11y/useMediaCaption: user uploads carry no captions */}
        <audio src={a.url} controls preload="none" aria-label={a.name} />
      </span>
    );
  }
  return (
    <a href={a.url} download="" target="_blank" rel="noopener noreferrer" className={styles.file}>
      <span aria-hidden="true">{a.fileType === "document" ? "📄" : "📦"}</span>
      <span>{a.name}</span>
      <span className={`num ${styles.time}`}>{kb(a.size)}</span>
    </a>
  );
}

/** Only YouTube's own embed player may be framed; anything else shows its picture and a link. */
const framable = (url: string | null) =>
  url && /^https:\/\/www\.youtube(-nocookie)?\.com\/embed\//.test(url) ? url : null;

function EmbedView({ embed: e, message }: { embed: Embed; message: DiscordMessage }) {
  if (e.type === "gifv" && e.video) {
    return <video src={e.video} autoPlay loop muted playsInline className={styles.image} aria-label="GIF" />;
  }
  if (e.type === "image" && (e.image ?? e.thumbnail)) {
    // biome-ignore lint/performance/noImgElement: embed pictures from Discord's proxy
    return <img src={e.image ?? e.thumbnail ?? ""} alt="" className={styles.image} loading="lazy" />;
  }
  const frame = e.type === "video" ? framable(e.video) : null;
  return (
    <article className={styles.embed} style={e.color ? { borderLeftColor: e.color } : undefined}>
      {e.provider ? <p className={styles.time}>{e.provider.name}</p> : null}
      {e.author ? <p className={styles.embedAuthor}>{e.author.name}</p> : null}
      {e.title ? (
        <p className={styles.embedTitle}>
          {e.url ? (
            <a href={e.url} target="_blank" rel="noopener noreferrer">
              {e.title}
            </a>
          ) : (
            e.title
          )}
        </p>
      ) : null}
      {e.description ? (
        <div className={styles.text}>
          <DiscordText text={e.description} message={message} />
        </div>
      ) : null}
      {frame ? (
        <iframe
          src={frame}
          title={e.title ?? "วิดีโอ"}
          className={styles.frame}
          sandbox="allow-scripts allow-same-origin allow-presentation"
          allow="encrypted-media; picture-in-picture"
          loading="lazy"
        />
      ) : e.image ? (
        // biome-ignore lint/performance/noImgElement: embed pictures from Discord's proxy
        <img src={e.image} alt="" className={styles.image} loading="lazy" />
      ) : e.thumbnail ? (
        // biome-ignore lint/performance/noImgElement: embed thumbnails from Discord's proxy
        <img src={e.thumbnail} alt="" className={styles.thumb} loading="lazy" />
      ) : null}
    </article>
  );
}

/** Spec #111: a picture full size, with copy link, open and download. A native <dialog> traps focus. */
function Lightbox({ attachment: a, onClose }: { attachment: Attachment; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog ref={dialog} className={styles.lightbox} onClose={onClose} aria-label={a.name}>
      {/* biome-ignore lint/performance/noImgElement: the attachment itself, full size */}
      <img src={a.url} alt={a.name} className={styles.full} />
      <div className={styles.lightboxBar}>
        <span className={styles.lightboxName}>{a.name}</span>
        <button
          type="button"
          className={styles.ghost}
          onClick={() => void navigator.clipboard?.writeText(a.url).then(() => setCopied(true))}
        >
          {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
        </button>
        <a href={a.url} target="_blank" rel="noopener noreferrer" className={styles.ghost}>
          เปิดในแท็บใหม่
        </a>
        <a href={a.url} download="" className={styles.ghost}>
          ดาวน์โหลด
        </a>
        <button type="button" className={styles.ghost} onClick={() => dialog.current?.close()}>
          ปิด
        </button>
      </div>
    </dialog>
  );
}
