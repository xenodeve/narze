import { ApplicationCommandType, ChatInputCommandInteraction, GuildMember, EmbedBuilder, HexColorString, MessageFlags } from "discord.js";
import { clientBot } from "../../interfaces/client";
import configjson from "../../config/config.json";
import { convertTime } from "../../functions/convertTime/convertTime";
import { getIconURL } from "../../functions/lavalink/iconConfig";
import { isFromPlaylist, formatPlaylistInfo, getPlaylistUrl } from "../../functions/lavalink/playlistMetadata";

export default {
    name: 'pause',
    description: 'พัก/เล่นต่อ',
    type: ApplicationCommandType.ChatInput,
    run: async (client: clientBot, interaction: ChatInputCommandInteraction) => {
        if(!client.manager.initiated) 
            return interaction.reply({ content: 'The bot is not ready yet. Please try again later.', flags: MessageFlags.Ephemeral });

        const member = interaction.member as GuildMember;
        const userAvatar = interaction.user.displayAvatarURL();
        const player = client.manager.players.get(interaction.guild.id);

        // ตรวจสอบว่ามี player หรือไม่
        if (!player) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` ไม่มีบอทในห้อง`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // ตรวจสอบว่ามีเพลงที่เล่นอยู่หรือไม่
        if (!player.current) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` ไม่มีเพลงที่เล่นอยู่`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // ตรวจสอบว่า user อยู่ในห้องเสียงหรือไม่
        if (!member.voice || !member.voice.channel) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` กรุณาเข้าห้องเสียงด้วย`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // ตรวจสอบว่า user อยู่ในห้องเดียวกับบอทหรือไม่
        if (interaction.guild.members.me.voice.channel && (member.voice.channelId !== interaction.guild.members.me.voice.channelId)) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` คุณต้องอยู่ในห้องเดียวกับบอท`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const currentTrack = player.current;
        const iconURL = await getIconURL(currentTrack, userAvatar);
        
        // สร้าง description พื้นฐาน
        let baseDescription = `**${currentTrack.info.title}** \` ${convertTime(currentTrack.info.length)} \``;
        
        // เพิ่มข้อมูล playlist หากมี
        let playlistDescription = '';
        if (isFromPlaylist(currentTrack)) {
            const playlistInfo = formatPlaylistInfo(currentTrack, 'short');
            const indexInfo = formatPlaylistInfo(currentTrack, 'index-only');
            playlistDescription = `\n> ${playlistInfo} ${indexInfo}`;
        }
        
        // กำหนด author URL
        let authorURL = currentTrack.info.uri;
        if (isFromPlaylist(currentTrack)) {
            const playlistUrl = getPlaylistUrl(currentTrack);
            if (playlistUrl) {
                authorURL = playlistUrl;
            }
        }

        try {
            if (player.paused) {
                // Resume การเล่น
                await player.pause(false);

                const embed = new EmbedBuilder()
                    .setColor(configjson.embed_color as HexColorString)
                    .setAuthor({ name: 'Go to Page', iconURL: String(iconURL), url: authorURL })
                    .setDescription(`\`▶️\`┃${baseDescription}${playlistDescription}`)
                    .setThumbnail(currentTrack.info.thumbnail)
                    .setFooter({ text: 'เล่นต่อ' });

                return interaction.reply({ embeds: [embed] });
            } else {
                // Pause การเล่น
                await player.pause(true);

                const embed = new EmbedBuilder()
                    .setColor(configjson.embed_color as HexColorString)
                    .setAuthor({ name: 'Go to Page', iconURL: String(iconURL), url: authorURL })
                    .setDescription(`\`⏸️\`┃${baseDescription}${playlistDescription}`)
                    .setThumbnail(currentTrack.info.thumbnail)
                    .setFooter({ text: 'พักการเล่น' });

                return interaction.reply({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Pause/Resume error:', error);
            
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` เกิดข้อผิดพลาดในการพัก/เล่นต่อ`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    }
}
