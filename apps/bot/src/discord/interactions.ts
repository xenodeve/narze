import {
  type ChatInputCommandInteraction,
  type Client,
  EmbedBuilder,
  type GuildMember,
  MessageFlags,
  PermissionFlagsBits,
  type VoiceBasedChannel,
} from "discord.js";
import { commands } from "../commands";
import type { CommandContext } from "../commands/types";
import type { Notice } from "../music/format";
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
    if (!interaction.isChatInputCommand() || !interaction.inCachedGuild()) return;
    const command = commands.find((c) => c.data.name === interaction.commandName);
    if (!command) return;
    if (!isReady()) {
      await interaction.reply({ content: NOT_READY, flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }
    try {
      const reply = await command.run(contextOf(interaction), music);
      await interaction.reply({
        embeds: [toEmbed(reply.notice)],
        flags: reply.ephemeral ? MessageFlags.Ephemeral : undefined,
      });
    } catch (error) {
      console.warn(`[bot] /${interaction.commandName}: ${error instanceof Error ? error.message : String(error)}`);
      const answer = { content: FAILED, flags: MessageFlags.Ephemeral } as const;
      await (interaction.replied ? interaction.followUp(answer) : interaction.reply(answer)).catch(() => {});
    }
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
