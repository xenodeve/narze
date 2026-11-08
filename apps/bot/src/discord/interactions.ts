import {
  ActionRowBuilder,
  type AutocompleteInteraction,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  type ChatInputCommandInteraction,
  type Client,
  ComponentType,
  EmbedBuilder,
  type GuildMember,
  MessageFlags,
  PermissionFlagsBits,
  type VoiceBasedChannel,
} from "discord.js";
import { commands } from "../commands";
import type { CommandContext, Reply, SetChannelResult } from "../commands/types";
import { COLOR_FAILURE, type Notice } from "../music/format";
import type { Music } from "../music/music";
import type { GuildSettingsCache } from "../settings/guild-settings";
import { auditNotice, promoNotice, shouldPromo } from "./audit";

/** What a command run may reach beyond the music engine (#106). */
export interface InteractionOptions {
  settings?: GuildSettingsCache;
  /** Spec #13: where every command use is logged (`LOG_GUILD_ID` / `LOG_CHANNEL_ID`). */
  log?: { guildId: string; channelId: string };
  /** Spec #34: the Dashboard the promo points at. */
  dashboardUrl?: string;
  /** Tells the Dashboard a Guild's settings changed (Connected Mode, spec #92). */
  settingsChanged?: (guildId: string) => Promise<void>;
}

export function toEmbed(notice: Notice): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(notice.color);
  if (notice.author)
    embed.setAuthor({ name: notice.author.name, url: notice.author.url, iconURL: notice.author.iconUrl });
  if (notice.title) embed.setTitle(notice.title);
  if (notice.description) embed.setDescription(notice.description);
  if (notice.thumbnailUrl) embed.setThumbnail(notice.thumbnailUrl);
  if (notice.footer) embed.setFooter({ text: notice.footer });
  if (notice.fields) embed.addFields(notice.fields);
  return embed;
}

/** ViewChannel + Connect + Speak, and room in the channel unless the Bot may manage it (spec #11). */
function botCanSpeakIn(channel: VoiceBasedChannel | undefined, me: GuildMember | null): boolean {
  if (!channel || !me) return false;
  const perms = channel.permissionsFor(me);
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]))
    return false;
  const full = channel.userLimit > 0 && channel.members.size >= channel.userLimit;
  return !full || perms.has(PermissionFlagsBits.ManageChannels);
}

const NOT_READY = "The bot is not ready yet. Please try again later.";
const FAILED = "There was an error while executing this command!";

/** Routes slash commands to their handlers; DMs get no response (v5). */
export function handleInteractions(
  client: Client,
  music: Music,
  isReady: () => boolean,
  options: InteractionOptions = {},
): void {
  client.on("interactionCreate", async (interaction) => {
    if (interaction.isAutocomplete() && interaction.inCachedGuild()) {
      await suggest(interaction, music).catch(() => {});
      return;
    }
    if (!interaction.isChatInputCommand() || !interaction.inCachedGuild()) return;
    const command = commands.find((c) => c.data.name === interaction.commandName);
    if (!command) return;
    if (!isReady()) {
      await interaction.reply({ content: NOT_READY, flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }
    let succeeded = false;
    try {
      if (command.slow) await interaction.deferReply();
      const reply = await command.run(contextOf(interaction, options), music);
      const embeds = [toEmbed(reply.notice)];
      if (reply.pager) {
        await page(interaction, reply.notice, reply.pager);
      } else if (!interaction.deferred) {
        await interaction.reply({ embeds, flags: reply.ephemeral ? MessageFlags.Ephemeral : undefined });
      } else if (reply.ephemeral) {
        // A deferred public reply cannot turn private: replace it with a private follow-up.
        await interaction.deleteReply();
        await interaction.followUp({ embeds, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.editReply({ embeds });
      }
      succeeded = true;
    } catch (error) {
      console.warn(`[bot] /${interaction.commandName}: ${error instanceof Error ? error.message : String(error)}`);
      const answer = { content: FAILED, flags: MessageFlags.Ephemeral } as const;
      const send =
        interaction.replied || interaction.deferred ? interaction.followUp(answer) : interaction.reply(answer);
      await send.catch(() => {});
    }
    await afterCommand(interaction, succeeded, options);
  });
}

/** Spec #13, #34: every use is logged; a successful music command sometimes points at the Dashboard. */
async function afterCommand(
  interaction: ChatInputCommandInteraction<"cached">,
  succeeded: boolean,
  { log, dashboardUrl }: InteractionOptions,
): Promise<void> {
  if (succeeded && dashboardUrl && shouldPromo(interaction.commandName)) {
    await interaction.channel?.send({ embeds: [toEmbed(promoNotice(dashboardUrl))] }).catch(() => {});
  }
  if (!log) return;
  const channel = interaction.client.guilds.cache.get(log.guildId)?.channels.cache.get(log.channelId);
  if (!channel?.isTextBased()) return;
  const voice = interaction.member.voice.channel;
  const notice = auditNotice({
    user: { id: interaction.user.id, tag: interaction.user.tag, avatarUrl: interaction.user.displayAvatarURL() },
    voice: voice ? { name: voice.name, id: voice.id } : null,
    command: { name: interaction.commandName, id: interaction.commandId },
    channel: { name: interaction.channel?.name ?? "?", id: interaction.channelId },
    guild: { name: interaction.guild.name, id: interaction.guild.id, iconUrl: interaction.guild.iconURL() },
  });
  await channel.send({ embeds: [toEmbed(notice)] }).catch(() => {});
}

/** Autocomplete: the command builds suggestions for the focused option (Discord shows at most 25). */
async function suggest(interaction: AutocompleteInteraction<"cached">, music: Music): Promise<void> {
  const command = commands.find((c) => c.data.name === interaction.commandName);
  if (!command?.autocomplete) return interaction.respond([]);
  const ctx = contextOf(interaction as unknown as ChatInputCommandInteraction<"cached">, {});
  const focused = interaction.options.getFocused(true);
  const choices = await command.autocomplete(ctx, music, String(focused.value), focused.name);
  await interaction.respond(choices.slice(0, 25));
}

const PAGER_MS = 5 * 60 * 1000;

/**
 * /queue's pages (spec #8): prev / page / next buttons, usable only by whoever ran the command, for
 * five minutes; each click re-reads the queue. When the time is up the buttons are disabled.
 */
async function page(
  interaction: ChatInputCommandInteraction<"cached">,
  first: Notice,
  pager: NonNullable<Reply["pager"]>,
): Promise<void> {
  let current = 0;
  let pages = pager.pages;
  const buttons = (disabled = false) =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("queue_prev")
        .setLabel("← หน้าก่อน")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || current === 0),
      new ButtonBuilder()
        .setCustomId("queue_page_info")
        .setLabel(`${current + 1}/${pages}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId("queue_next")
        .setLabel("หน้าถัดไป →")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || current >= pages - 1),
    );
  const message = await interaction.reply({ embeds: [toEmbed(first)], components: [buttons()], withResponse: true });
  const collector = message.resource?.message?.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: PAGER_MS,
  });
  collector?.on("collect", async (click) => {
    if (click.user.id !== interaction.user.id) {
      await click.reply({ content: "คุณไม่สามารถใช้ปุ่มนี้ได้", flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }
    const shown = pager.render(Math.max(0, current + (click.customId === "queue_next" ? 1 : -1)));
    if (!shown) {
      collector.stop();
      await click
        .update({
          embeds: [toEmbed({ color: COLOR_FAILURE, description: "> `❌` ไม่มีเพลงกำลังเล่นแล้ว" })],
          components: [],
        })
        .catch(() => {});
      return;
    }
    current = shown.page;
    pages = shown.pages;
    await click.update({ embeds: [toEmbed(shown.notice)], components: [buttons()] }).catch(() => {});
  });
  collector?.on("end", () => {
    void interaction.editReply({ components: [buttons(true)] }).catch(() => {});
  });
}

function contextOf(interaction: ChatInputCommandInteraction<"cached">, options: InteractionOptions): CommandContext {
  const { settings, settingsChanged } = options;
  const { guild, member, user } = interaction;
  return {
    guildId: guild.id,
    channelId: interaction.channelId,
    user: { id: user.id, name: member.displayName, avatarUrl: user.displayAvatarURL() },
    memberVoiceChannelId: member.voice.channelId,
    canSpeakIn: (id) => {
      const channel = guild.channels.cache.get(id);
      return botCanSpeakIn(channel?.isVoiceBased() ? channel : undefined, guild.members.me);
    },
    option: (name) => {
      const option = interaction.options.get(name);
      return typeof option?.value === "string" || typeof option?.value === "number" ? option.value : null;
    },
    latencyMs: { reply: Date.now() - interaction.createdTimestamp, ws: interaction.client.ws.ping },
    setMusicChannel: settings
      ? (channelId) => saveMusicChannel(interaction, settings, channelId, settingsChanged)
      : undefined,
  };
}

/**
 * /setchannel's save (#106): only the Server Owner or the Bot Owner (the same rule as the
 * Dashboard, AC1 — Manage Server alone is not enough), only a channel the Bot can post in, a row
 * created if the Bot never recorded one, and the Dashboard told.
 */
async function saveMusicChannel(
  interaction: ChatInputCommandInteraction<"cached">,
  settings: GuildSettingsCache,
  channelId: string | null,
  settingsChanged?: (guildId: string) => Promise<void>,
): Promise<SetChannelResult> {
  const { guild, user } = interaction;
  try {
    const stored = (await settings.load(guild.id)) ?? (await settings.join(guild, null), await settings.load(guild.id));
    if (guild.ownerId !== user.id && stored?.ownerId !== user.id) return "forbidden";
    if (channelId) {
      const channel = guild.channels.cache.get(channelId);
      const me = guild.members.me;
      const canPost =
        channel?.type === ChannelType.GuildText &&
        me !== null &&
        Boolean(channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]));
      if (!canPost) return "cannot-post";
    }
    await settings.setMusicChannel(guild.id, channelId);
    await settingsChanged?.(guild.id).catch(() => {});
    return "ok";
  } catch {
    return "failed";
  }
}

/** Posts a Now-Playing Notice; a channel the Bot cannot write to is skipped. */
export function announcer(client: Client) {
  return async (channelId: string, notice: Notice): Promise<boolean> => {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isSendable()) return false;
    return channel
      .send({ embeds: [toEmbed(notice)] })
      .then(() => true)
      .catch(() => false);
  };
}
