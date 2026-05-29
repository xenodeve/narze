import { 
    ApplicationCommandType, 
    ChatInputCommandInteraction,
    EmbedBuilder, 
    HexColorString,
    PermissionFlagsBits,
    ChannelType,
    TextChannel
} from "discord.js";
import { clientBot } from "../interfaces/client";
import configjson from "../config/config.json";
import { getGuildSettings, setMusicChannel, upsertGuildSettings } from "../functions/guildSettings";

export default {
    name: "setchannel",
    description: "ตั้งค่า Music Text Channel สำหรับบอท",
    type: ApplicationCommandType.ChatInput,
    default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
    options: [
        {
            name: "channel",
            description: "เลือก Text Channel สำหรับส่งข้อความเกี่ยวกับเพลง (ไม่ระบุ = ลบการตั้งค่า)",
            type: 7, // CHANNEL type
            required: false,
            channel_types: [ChannelType.GuildText]
        }
    ],
    run: async (client: clientBot, interaction: ChatInputCommandInteraction) => {
        await interaction.deferReply({ ephemeral: true });

        const guildId = interaction.guildId;
        if (!guildId) {
            return interaction.editReply({ 
                content: "❌ คำสั่งนี้ใช้ได้เฉพาะใน Server เท่านั้น" 
            });
        }

        // Get channel option
        const channel = interaction.options.getChannel('channel') as TextChannel | null;

        try {
            // Check if guild settings exist, if not create them
            let settings = await getGuildSettings(guildId);
            if (!settings) {
                // Create settings with the command user as owner (or guild owner)
                const guild = interaction.guild;
                await upsertGuildSettings({
                    guildId: guildId,
                    guildName: guild?.name,
                    ownerId: guild?.ownerId || interaction.user.id,
                    musicChannelId: channel?.id
                });
            } else {
                // Update music channel
                await setMusicChannel(guildId, channel?.id || null);
            }

            const embed = new EmbedBuilder()
                .setColor(configjson.embed_color as HexColorString)
                .setTitle('⚙️ | ตั้งค่า Music Channel')
                .setDescription(
                    channel 
                        ? `✅ ตั้งค่า Music Channel เป็น ${channel} สำเร็จ!\n\nบอทจะส่งข้อความเกี่ยวกับเพลงใน channel นี้`
                        : `✅ ลบการตั้งค่า Music Channel แล้ว\n\nบอทจะส่งข้อความใน channel ที่สั่งเพลง`
                )
                .setFooter({ text: `ตั้งค่าโดย ${interaction.user.tag}` })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error setting music channel:', error);
            return interaction.editReply({ 
                content: "❌ เกิดข้อผิดพลาดในการตั้งค่า กรุณาลองใหม่อีกครั้ง" 
            });
        }
    }
};
