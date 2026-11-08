import {
  type AdminGuild,
  type AdminQuery,
  type AdminQueryResult,
  AdminQuerySchema,
  Channels,
  type DiscordMessage,
  fileTypeOf,
  MESSAGE_PAGE,
  type MessagePage,
  parseJson,
  RESTART_EXIT_CODE,
  SHUTDOWN_EXIT_CODE,
  type TextChannelEntry,
} from "@narze/shared";
import { ChannelType, type Client, type Guild } from "discord.js";
import type Redis from "ioredis";

type Each<T> = { values(): Iterable<T> };
type UserLike = { id: string; username: string; globalName?: string | null; bot: boolean; displayAvatarURL(): string };
type Url = { url: string; proxyURL?: string } | null;

/** The parts of a discord.js Message the channel viewer reads; tests build these from fixtures. */
export interface MessageLike {
  id: string;
  content: string;
  createdTimestamp: number;
  editedTimestamp: number | null;
  author: UserLike;
  member: { displayName: string } | null;
  mentions: {
    users: Each<UserLike>;
    roles: Each<{ id: string; name: string; hexColor: string }>;
  };
  attachments: Each<{
    id: string;
    name: string;
    url: string;
    size: number;
    contentType: string | null;
    width: number | null;
    height: number | null;
    spoiler: boolean;
  }>;
  embeds: Array<{
    data: { type?: string };
    title: string | null;
    description: string | null;
    url: string | null;
    hexColor: string | null;
    provider: { name?: string; url?: string } | null;
    author: { name: string; iconURL?: string } | null;
    thumbnail: Url;
    image: Url;
    video: Url;
  }>;
  reactions: { cache: Each<{ emoji: { name: string | null; id: string | null }; count: number }> };
  reference: { messageId?: string } | null;
  thread: {
    id: string;
    name: string;
    messageCount: number | null;
    archived: boolean | null;
    archiveTimestamp: number | null;
    createdTimestamp: number | null;
  } | null;
}

const nameOf = (m: MessageLike) => m.member?.displayName ?? m.author.globalName ?? m.author.username;
const httpUrl = (value: string | null | undefined) => (value && /^https?:\/\//.test(value) ? value : null);

/** A page of messages as the Dashboard reads it (spec #111), oldest first; replies resolve within the page. */
export function toMessages(messages: MessageLike[]): DiscordMessage[] {
  const byId = new Map(messages.map((m) => [m.id, m]));
  return [...messages]
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((m): DiscordMessage => {
      const ref = m.reference?.messageId;
      const replied = ref ? byId.get(ref) : undefined;
      return {
        id: m.id,
        content: m.content,
        author: {
          id: m.author.id,
          name: m.author.globalName ?? m.author.username,
          avatarUrl: httpUrl(m.author.displayAvatarURL()),
          bot: m.author.bot,
        },
        at: m.createdTimestamp,
        editedAt: m.editedTimestamp,
        mentions: [...m.mentions.users.values()].map((u) => ({ id: u.id, name: u.globalName ?? u.username })),
        mentionedRoles: [...m.mentions.roles.values()].map((r) => ({
          id: r.id,
          name: r.name,
          // A role without a colour reports black; Discord draws it in the default text colour.
          color: r.hexColor === "#000000" ? null : r.hexColor,
        })),
        attachments: [...m.attachments.values()].map((a) => ({
          id: a.id,
          name: a.name,
          url: a.url,
          size: a.size,
          contentType: a.contentType,
          fileType: fileTypeOf(a.contentType, a.name),
          width: a.width,
          height: a.height,
          spoiler: a.spoiler,
        })),
        embeds: m.embeds.map((e) => ({
          type: e.data.type ?? "rich",
          title: e.title,
          description: e.description,
          url: httpUrl(e.url),
          color: e.hexColor,
          provider: e.provider?.name ? { name: e.provider.name, url: httpUrl(e.provider.url) } : null,
          author: e.author ? { name: e.author.name, iconUrl: httpUrl(e.author.iconURL) } : null,
          // Discord's media proxy, so an admin's browser never fetches from the poster's own host.
          thumbnail: httpUrl(e.thumbnail?.proxyURL ?? e.thumbnail?.url),
          image: httpUrl(e.image?.proxyURL ?? e.image?.url),
          // A YouTube player has no proxy; the Dashboard frames only YouTube's embed host.
          video: httpUrl(e.video?.proxyURL ?? e.video?.url),
        })),
        reactions: [...m.reactions.cache.values()].map((r) => ({
          emoji: r.emoji.name ?? r.emoji.id ?? "?",
          count: r.count,
        })),
        replyTo: ref
          ? {
              messageId: ref,
              authorName: replied ? nameOf(replied) : null,
              content: replied ? replied.content.slice(0, 100) : "",
            }
          : null,
        thread: m.thread
          ? {
              id: m.thread.id,
              name: m.thread.name,
              messageCount: m.thread.messageCount ?? 0,
              lastActivityAt: m.thread.archiveTimestamp ?? m.thread.createdTimestamp ?? m.createdTimestamp,
              archived: m.thread.archived ?? false,
            }
          : null,
      };
    });
}

const KINDS = new Map<ChannelType, TextChannelEntry["kind"]>([
  [ChannelType.GuildText, "text"],
  [ChannelType.GuildAnnouncement, "announcement"],
  [ChannelType.PublicThread, "thread"],
  [ChannelType.PrivateThread, "thread"],
  [ChannelType.AnnouncementThread, "thread"],
]);

const toGuild = (guild: Guild): AdminGuild => ({
  id: guild.id,
  name: guild.name,
  iconUrl: guild.iconURL(),
  memberCount: guild.memberCount,
  joinedAt: guild.joinedTimestamp ?? null,
  ownerId: guild.ownerId,
});

export interface AdminQueryDeps {
  client: Client;
  /** Runs the Bot's normal shutdown, then exits with `code`. */
  exit: (code: number) => void;
}

/**
 * Answers one AdminQuery (#111). The Backend has already checked the asker is an Admin; this side
 * only reads what the Bot can see. Restart and shutdown answer first, then exit.
 */
export async function answerAdminQuery(query: AdminQuery, { client, exit }: AdminQueryDeps): Promise<AdminQueryResult> {
  const ok = (data: unknown): AdminQueryResult => ({ id: query.id, ok: true, data });
  const fail = (error: string): AdminQueryResult => ({ id: query.id, ok: false, error });
  switch (query.kind) {
    case "restart":
    case "shutdown": {
      console.warn(`[bot] ${query.kind} asked from the Dashboard by ${query.by}`);
      const code = query.kind === "restart" ? RESTART_EXIT_CODE : SHUTDOWN_EXIT_CODE;
      setTimeout(() => exit(code), 0);
      return ok(null);
    }
  }
  // While logging in the guild cache is incomplete: an empty list would be a wrong answer (m7).
  if (!client.isReady()) return fail("not-ready");
  if (query.kind === "guilds") return ok([...client.guilds.cache.values()].map(toGuild));
  const guild = client.guilds.cache.get(query.guildId);
  if (!guild) return fail("not-found");
  switch (query.kind) {
    case "guild":
      return ok(toGuild(guild));
    case "channels": {
      const entries: TextChannelEntry[] = [];
      for (const channel of guild.channels.cache.values()) {
        const kind = KINDS.get(channel.type);
        if (!kind) continue;
        const parent = channel.isThread() ? channel.parent : null;
        entries.push({
          id: channel.id,
          name: channel.name,
          kind,
          parentId: parent?.id ?? null,
          parentName: parent?.name ?? null,
          position: "position" in channel ? channel.position : 999,
        });
      }
      // Channels by position, then threads (v5 order).
      entries.sort((a, b) => Number(a.kind === "thread") - Number(b.kind === "thread") || a.position - b.position);
      return ok(entries);
    }
    case "messages": {
      const channel =
        guild.channels.cache.get(query.channelId) ?? (await guild.channels.fetch(query.channelId).catch(() => null));
      if (!channel || !KINDS.has(channel.type) || !channel.isTextBased()) return fail("not-found");
      const fetched = await channel.messages.fetch({ limit: MESSAGE_PAGE }).catch(() => null);
      if (!fetched) return fail("forbidden");
      const page: MessagePage = {
        channel: { id: channel.id, name: channel.name },
        messages: toMessages([...fetched.values()]),
      };
      return ok(page);
    }
  }
}

/** Answers AdminQueries from the Backend (#111), Connected Mode only. */
export async function startAdminQueries({
  subscriber,
  redis,
  ...deps
}: AdminQueryDeps & { subscriber: Redis; redis: Redis }): Promise<void> {
  subscriber.on("message", async (channel: string, raw: string) => {
    if (channel !== Channels.botAdminQueries) return;
    const query = parseJson(AdminQuerySchema, raw);
    if (!query) return;
    const result = await answerAdminQuery(query, deps).catch((error: unknown): AdminQueryResult => {
      console.warn(`[bot] admin ${query.kind}: ${error instanceof Error ? error.message : error}`);
      return { id: query.id, ok: false, error: "failed" };
    });
    await redis.publish(Channels.botAdminResults, JSON.stringify(result)).catch(() => {});
  });
  await subscriber.subscribe(Channels.botAdminQueries);
}
