import {
  ActionRowBuilder,
  type AutocompleteInteraction,
  ButtonBuilder,
  ButtonStyle,
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
import type { CommandContext, Reply } from "../commands/types";
import { COLOR_FAILURE, type Notice } from "../music/format";
import type { Music } from "../music/music";

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
export function handleInteractions(client: Client, music: Music, isReady: () => boolean): void {
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
    try {
      if (command.slow) await interaction.deferReply();
      const reply = await command.run(contextOf(interaction), music);
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
    } catch (error) {
      console.warn(`[bot] /${interaction.commandName}: ${error instanceof Error ? error.message : String(error)}`);
      const answer = { content: FAILED, flags: MessageFlags.Ephemeral } as const;
      const send =
        interaction.replied || interaction.deferred ? interaction.followUp(answer) : interaction.reply(answer);
      await send.catch(() => {});
    }
  });
}

/** Autocomplete: the command builds suggestions for the focused option (Discord shows at most 25). */
async function suggest(interaction: AutocompleteInteraction<"cached">, music: Music): Promise<void> {
  const command = commands.find((c) => c.data.name === interaction.commandName);
  if (!command?.autocomplete) return interaction.respond([]);
  const ctx = contextOf(interaction as unknown as ChatInputCommandInteraction<"cached">);
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

function contextOf(interaction: ChatInputCommandInteraction<"cached">): CommandContext {
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
  };
}

/** Posts a Now-Playing Notice; a channel the Bot cannot write to is skipped. */
export function announcer(client: Client) {
  return async (channelId: string, notice: Notice): Promise<void> => {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel?.isSendable()) await channel.send({ embeds: [toEmbed(notice)] });
  };
}
