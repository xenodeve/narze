import { z } from "zod";
import { DiscordIdSchema } from "./admin";

/**
 * What the admin area reads from Discord (#111, spec #110–#112). Only the Bot holds the Discord token
 * (ADR-0003), so the Backend asks it over Redis and caches the answers.
 */

const snowflake = z.string().regex(/^\d+$/);
const url = z.string().url();

export const AdminGuildSchema = z.object({
  id: snowflake,
  name: z.string(),
  iconUrl: url.nullable(),
  memberCount: z.number().int().nonnegative(),
  /** When the Bot joined; null when Discord did not say. */
  joinedAt: z.number().int().nullable(),
  ownerId: snowflake,
});
export type AdminGuild = z.infer<typeof AdminGuildSchema>;

/** A channel the viewer can read: text, announcement, or a thread under one of them. */
export const TextChannelEntrySchema = z.object({
  id: snowflake,
  name: z.string(),
  kind: z.enum(["text", "announcement", "thread"]),
  parentId: snowflake.nullable(),
  parentName: z.string().nullable(),
  position: z.number().int(),
});
export type TextChannelEntry = z.infer<typeof TextChannelEntrySchema>;

export const FileTypeSchema = z.enum(["image", "video", "audio", "document", "file"]);
export type FileType = z.infer<typeof FileTypeSchema>;

const EXTENSIONS: Array<[FileType, string[]]> = [
  ["image", ["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "svg"]],
  ["video", ["mp4", "webm", "mov", "mkv", "avi"]],
  ["audio", ["mp3", "ogg", "wav", "flac", "m4a", "aac", "opus"]],
  ["document", ["pdf", "txt", "md", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "json"]],
];

/** v5's attachment typing (spec #111): by content type first, then by extension. */
export function fileTypeOf(contentType: string | null, name: string): FileType {
  const major = contentType?.split("/")[0];
  if (major === "image" || major === "video" || major === "audio") return major;
  if (contentType === "application/pdf" || contentType?.startsWith("text/")) return "document";
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSIONS.find(([, list]) => list.includes(extension))?.[0] ?? "file";
}

export const AttachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  url,
  size: z.number().int().nonnegative(),
  contentType: z.string().nullable(),
  fileType: FileTypeSchema,
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  spoiler: z.boolean(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

export const EmbedSchema = z.object({
  /** rich, image, video, gifv, link, article… as Discord names them. */
  type: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  url: url.nullable(),
  color: z.string().nullable(),
  provider: z.object({ name: z.string(), url: url.nullable() }).nullable(),
  author: z.object({ name: z.string(), iconUrl: url.nullable() }).nullable(),
  thumbnail: url.nullable(),
  image: url.nullable(),
  video: url.nullable(),
});
export type Embed = z.infer<typeof EmbedSchema>;

export const DiscordMessageSchema = z.object({
  id: snowflake,
  content: z.string(),
  author: z.object({ id: snowflake, name: z.string(), avatarUrl: url.nullable(), bot: z.boolean() }),
  at: z.number().int(),
  editedAt: z.number().int().nullable(),
  mentions: z.array(z.object({ id: snowflake, name: z.string() })),
  mentionedRoles: z.array(z.object({ id: snowflake, name: z.string(), color: z.string().nullable() })),
  attachments: z.array(AttachmentSchema),
  embeds: z.array(EmbedSchema),
  reactions: z.array(z.object({ emoji: z.string(), count: z.number().int().nonnegative() })),
  /** The message this one answers; `content` is cut to 100 characters. */
  replyTo: z.object({ messageId: snowflake, authorName: z.string().nullable(), content: z.string() }).nullable(),
  thread: z
    .object({
      id: snowflake,
      name: z.string(),
      messageCount: z.number().int().nonnegative(),
      lastActivityAt: z.number().int(),
      archived: z.boolean(),
    })
    .nullable(),
});
export type DiscordMessage = z.infer<typeof DiscordMessageSchema>;

/** The viewer shows the last MESSAGE_PAGE messages of a channel, oldest first (spec #111). */
export const MESSAGE_PAGE = 50;

export const MessagePageSchema = z.object({
  channel: z.object({ id: snowflake, name: z.string() }),
  messages: z.array(DiscordMessageSchema),
});
export type MessagePage = z.infer<typeof MessagePageSchema>;

/** Backend → Bot over Redis; the Bot answers each by id (`AdminQueryResult`). */
export const AdminQuerySchema = z.discriminatedUnion("kind", [
  z.object({ id: z.string().min(1), kind: z.literal("guilds") }),
  z.object({ id: z.string().min(1), kind: z.literal("guild"), guildId: snowflake }),
  z.object({ id: z.string().min(1), kind: z.literal("channels"), guildId: snowflake }),
  z.object({ id: z.string().min(1), kind: z.literal("messages"), guildId: snowflake, channelId: snowflake }),
  z.object({ id: z.string().min(1), kind: z.literal("restart"), by: DiscordIdSchema }),
  z.object({ id: z.string().min(1), kind: z.literal("shutdown"), by: DiscordIdSchema }),
]);
export type AdminQuery = z.infer<typeof AdminQuerySchema>;
/** An AdminQuery without its id, as callers write it. */
export type AdminQueryRequest = AdminQuery extends infer Q ? (Q extends AdminQuery ? Omit<Q, "id"> : never) : never;

export const AdminQueryResultSchema = z.union([
  z.object({ id: z.string(), ok: z.literal(true), data: z.unknown() }),
  z.object({ id: z.string(), ok: z.literal(false), error: z.string() }),
]);
export type AdminQueryResult = z.infer<typeof AdminQueryResultSchema>;

/** The Bot exits with these after answering; a process manager restarts it only on RESTART_EXIT_CODE. */
export const SHUTDOWN_EXIT_CODE = 0;
export const RESTART_EXIT_CODE = 75;
