import { z } from "zod";
import { SnowflakeSchema } from "./commands";

/** What `bot-avatars` can draw (its BotAvatarType / Hat / Glasses unions, pinned 0.2.2). */
export const AVATAR_TYPES = [
  "clover",
  "flower",
  "triangle",
  "square",
  "blob",
  "ghost",
  "circle",
  "drop",
  "star",
  "droid",
  "mech",
  "alien",
  "hexagon",
  "cat",
  "cloud",
  "pill",
  "pebble",
  "puddle",
] as const;
export const AVATAR_HATS = ["none", "beret", "beanie", "party", "crown"] as const;
export const AVATAR_GLASSES = ["none", "round", "square", "shades"] as const;

/** The Bot Avatar's outfit for one Guild (DESIGN.md: type, hat, glasses, headphones, bow tie, accessory colour). */
export const AvatarOutfitSchema = z.object({
  type: z.enum(AVATAR_TYPES).default("clover"),
  hat: z.enum(AVATAR_HATS).default("none"),
  glasses: z.enum(AVATAR_GLASSES).default("none"),
  headphones: z.boolean().default(true),
  bowTie: z.boolean().default(false),
  /** A plain hex colour only: it is drawn on a canvas and must not carry anything else. */
  accessoryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#1d1d1f"),
});
export type AvatarOutfit = z.infer<typeof AvatarOutfitSchema>;
export const DEFAULT_OUTFIT: AvatarOutfit = AvatarOutfitSchema.parse({});

/** Guild Settings (#106, spec #121): kept after the Bot leaves; Supabase is the source of truth. */
export const GuildSettingsSchema = z.object({
  guildId: z.string(),
  guildName: z.string(),
  /** Bot Owner: whoever invited the Bot (audit log), else the Server Owner. */
  ownerId: z.string(),
  /** Where the Bot's notices go; null = the channel where the command was used. */
  musicChannelId: z.string().nullable(),
  avatar: AvatarOutfitSchema.catch(DEFAULT_OUTFIT),
});
export type GuildSettings = z.infer<typeof GuildSettingsSchema>;

/** A change from the Dashboard: the Music Channel (null clears it), the outfit, or both. */
export const SettingsUpdateSchema = z
  .object({
    musicChannelId: SnowflakeSchema.nullable().optional(),
    // No defaults here: a change names only the fields it changes, the rest stay as stored.
    avatar: z
      .object({
        type: z.enum(AVATAR_TYPES),
        hat: z.enum(AVATAR_HATS),
        glasses: z.enum(AVATAR_GLASSES),
        headphones: z.boolean(),
        bowTie: z.boolean(),
        accessoryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      })
      .partial()
      .optional(),
  })
  .refine((u) => u.musicChannelId !== undefined || u.avatar !== undefined, "nothing to change");
export type SettingsUpdate = z.infer<typeof SettingsUpdateSchema>;

/** A text channel the Bot can post in (#106 Music Channel picker). */
export const TextChannelListSchema = z.array(z.object({ id: z.string(), name: z.string() }));
export type TextChannelList = z.infer<typeof TextChannelListSchema>;

/** What GET/PUT /api/guilds/:id/settings answers (#106, spec #92). */
export const SettingsViewSchema = z.object({
  settings: GuildSettingsSchema,
  /** Only the Server Owner and the Bot Owner may change settings (enforced on PUT). */
  canEdit: z.boolean(),
  /** The text channels the Bot can post in, for the Music Channel picker. */
  textChannels: TextChannelListSchema,
});
export type SettingsView = z.infer<typeof SettingsViewSchema>;
