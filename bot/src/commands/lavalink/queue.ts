import { ApplicationCommandType, ChatInputCommandInteraction, GuildMember, EmbedBuilder, HexColorString, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ButtonInteraction } from "discord.js";
import { clientBot } from "../../interfaces/client";
import configjson from "../../config/config.json";
import { convertTime } from "../../functions/convertTime/convertTime";
import { getIconURL } from "../../functions/lavalink/iconConfig";

export default {
    name: 'queue',
    description: 'แสดงเพลงที่กำลังเล่นและคิวทั้งหมด',
    type: ApplicationCommandType.ChatInput,
    run: async (client: clientBot, interaction: ChatInputCommandInteraction) => {
        if(!client.manager.initiated) 
            return interaction.reply({ content: 'The bot is not ready yet. Please try again later.', flags: MessageFlags.Ephemeral });

        const member = interaction.member as GuildMember;
        const userAvatar = interaction.user.displayAvatarURL();

        // ตรวจสอบว่ามี player หรือไม่
        const player = client.manager.players.get(interaction.guild.id);

        if (!player || (!player.playing && !player.paused)) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` ไม่มีเพลงกำลังเล่น`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // ฟังก์ชันสร้าง Embed สำหรับหน้าต่างๆ
        const createQueueEmbed = async (page: number = 0) => {
            // ดึงข้อมูลใหม่ทุกครั้งที่สร้าง embed
            const currentPlayer = client.manager.players.get(interaction.guild.id);
            if (!currentPlayer) return null;
            
            const currentTrack = currentPlayer.current;
            const queueTracks = [...currentPlayer.queue];
            
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_color as HexColorString)
                // .setTimestamp();

            let description = '';

            // แสดงเพลงที่กำลังเล่น
            if (currentTrack) {
                const iconURL = await getIconURL(currentTrack, userAvatar);
                embed.setAuthor({ 
                    name: 'Go to Current Song', 
                    iconURL: iconURL, 
                    url: currentTrack.info.uri 
                });

                const status = currentPlayer.playing ? '\`▶️\`┃' : currentPlayer.paused ? '\`⏸️\`┃' : '\`⏹️\`┃';
                description += `**กำลังเล่น:**\n${status} **[${currentTrack.info.title}](${currentTrack.info.uri})** \` ${convertTime(currentTrack.info.length)} \`\n`;
                description += `> **ศิลปิน:** ${currentTrack.info.author}\n\n`;
                
                embed.setThumbnail(currentTrack.info.thumbnail);
            }

            // แสดงคิว
            if (queueTracks.length === 0) {
                description += `**คิวเพลง:** \` ว่างเปล่า \``;
            } else {
                const itemsPerPage = 10;
                const startIndex = page * itemsPerPage;
                const endIndex = Math.min(startIndex + itemsPerPage, queueTracks.length);
                const totalPages = Math.ceil(queueTracks.length / itemsPerPage);

                description += `**คิวเพลง:** (${queueTracks.length} เพลง`;
                if (totalPages > 1) {
                    description += ` - หน้า ${page + 1}/${totalPages}`;
                }
                description += `)\n\n`;

                // แสดงเพลงในหน้าปัจจุบัน
                for (let i = startIndex; i < endIndex; i++) {
                    const track = queueTracks[i];
                    const position = i + 1;
                    description += `**${position})** **[${track.info.title}](${track.info.uri})** \` ${convertTime(track.info.length)} \`\n`;
                    description += `> **ศิลปิน:** ${track.info.author}\n\n`;
                }

                // คำนวณเวลารวมของคิวทั้งหมด
                const totalDuration = queueTracks.reduce((total, track) => {
                    return total + (track.info.length || 0);
                }, 0);

                description += `**เวลารวมคิว:** \` ${convertTime(totalDuration)} \``;
            }

            embed.setDescription(description);
            return { embed, queueLength: queueTracks.length };
        };

        // ฟังก์ชันสร้างปุ่ม
        const createButtons = (currentPage: number, queueLength: number) => {
            const itemsPerPage = 10;
            const totalPages = Math.ceil(queueLength / itemsPerPage);
            
            if (totalPages <= 1) return null;

            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('queue_prev')
                        .setLabel('← หน้าก่อน')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage === 0),
                    new ButtonBuilder()
                        .setCustomId('queue_page_info')
                        .setLabel(`${currentPage + 1}/${totalPages}`)
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('queue_next')
                        .setLabel('หน้าถัดไป →')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage === totalPages - 1)
                );

            return row;
        };

        try {
            let currentPage = 0;
            const embedResult = await createQueueEmbed(currentPage);
            if (!embedResult) {
                const embed = new EmbedBuilder()
                    .setColor(configjson.embed_fail as HexColorString)
                    .setDescription(`> \`❌\` ไม่มีเพลงกำลังเล่น`);
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
            
            const { embed, queueLength } = embedResult;
            const buttons = createButtons(currentPage, queueLength);

            await interaction.reply({
                embeds: [embed],
                components: buttons ? [buttons] : []
            });

            const response = await interaction.fetchReply();

            // ถ้าไม่มีปุ่ม (เพลงน้อยกว่า 10) ไม่ต้องสร้าง collector
            if (!buttons) return;

            // สร้าง Button Collector
            const collector = response.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000 // 5 นาที
            });

            collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
                // ตรวจสอบว่าผู้กดปุ่มเป็นคนเดียวกับที่เรียกคำสั่ง
                if (buttonInteraction.user.id !== interaction.user.id) {
                    return buttonInteraction.reply({
                        content: 'คุณไม่สามารถใช้ปุ่มนี้ได้',
                        ephemeral: true
                    });
                }

                // ตรวจสอบว่า player ยังมีอยู่หรือไม่
                const currentPlayer = client.manager.players.get(interaction.guild.id);
                if (!currentPlayer || (!currentPlayer.playing && !currentPlayer.paused)) {
                    const embed = new EmbedBuilder()
                        .setColor(configjson.embed_fail as HexColorString)
                        .setDescription(`> \`❌\` ไม่มีเพลงกำลังเล่นแล้ว`);

                    return buttonInteraction.update({
                        embeds: [embed],
                        components: []
                    });
                }

                // ดึงข้อมูลคิวใหม่เพื่อคำนวณจำนวนหน้า
                const currentQueueTracks = [...currentPlayer.queue];
                const itemsPerPage = 10;
                const totalPages = Math.ceil(currentQueueTracks.length / itemsPerPage);

                // จัดการปุ่ม
                if (buttonInteraction.customId === 'queue_prev' && currentPage > 0) {
                    currentPage--;
                } else if (buttonInteraction.customId === 'queue_next' && currentPage < totalPages - 1) {
                    currentPage++;
                }

                // อัพเดท embed และปุ่ม
                const newEmbedResult = await createQueueEmbed(currentPage);
                if (!newEmbedResult) {
                    const embed = new EmbedBuilder()
                        .setColor(configjson.embed_fail as HexColorString)
                        .setDescription(`> \`❌\` ไม่มีเพลงกำลังเล่นแล้ว`);

                    return buttonInteraction.update({
                        embeds: [embed],
                        components: []
                    });
                }
                
                const { embed: newEmbed, queueLength: newQueueLength } = newEmbedResult;
                const newButtons = createButtons(currentPage, newQueueLength);

                await buttonInteraction.update({
                    embeds: [newEmbed],
                    components: newButtons ? [newButtons] : []
                });
            });

            collector.on('end', async () => {
                try {
                    // ดึงข้อมูลคิวล่าสุดเพื่อสร้างปุ่มที่ปิดการใช้งาน
                    const finalPlayer = client.manager.players.get(interaction.guild.id);
                    const finalQueueLength = finalPlayer ? finalPlayer.queue.size : 0;
                    
                    const disabledButtons = createButtons(currentPage, finalQueueLength);
                    if (disabledButtons) {
                        disabledButtons.components.forEach(button => button.setDisabled(true));
                        await interaction.editReply({
                            components: [disabledButtons]
                        });
                    }
                } catch (error) {
                    // ไม่ต้องทำอะไรถ้า edit ไม่ได้ (อาจจะถูกลบแล้ว)
                }
            });

        } catch (error) {
            console.error('Queue command error:', error);
            
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` เกิดข้อผิดพลาดในการแสดงคิว`);

            if (interaction.replied) {
                return interaction.editReply({ embeds: [embed], components: [] });
            } else {
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
        }
    }
}
