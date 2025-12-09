import { ApplicationCommandOptionType, ApplicationCommandType, ChatInputCommandInteraction, GuildMember, EmbedBuilder, HexColorString, MessageFlags, AutocompleteInteraction } from "discord.js";
import { clientBot } from "../../interfaces/client";
import configjson from "../../config/config.json";
import { convertTime } from "../../functions/convertTime/convertTime";
import { getIconURL } from "../../functions/lavalink/iconConfig";

export default {
    name: 'playqueue',
    description: 'เลือกเพลงจากคิวมาเล่นทันที',
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: 'song',
            description: 'เลือกเพลงจากคิว',
            type: ApplicationCommandOptionType.String,
            required: true,
            autocomplete: true
        }
    ],
    autocomplete: async (client: clientBot, interaction: AutocompleteInteraction) => {
        const query = interaction.options.getString('song');
        const choices = [];

        try {
            // ตรวจสอบว่ามี player หรือไม่
            const player = client.manager.players.get(interaction.guild.id);

            if (!player || (!player.playing && !player.paused)) {
                choices.push({ name: 'ไม่มีเพลงในคิว', value: 'no_queue_error' });
            } else if (player.queue.size === 0) {
                choices.push({ name: 'คิวว่างเปล่า', value: 'empty_queue_error' });
            } else {
                // แสดงเพลงในคิว
                const queueTracks = [...player.queue].slice(0, 25); // จำกัดแค่ 25 เพลงแรก
                
                if (!query || query.length === 0) {
                    // แสดงเพลงทั้งหมดในคิว
                    queueTracks.forEach((track, index) => {
                        const position = index + 1;
                        const title = `${position}. (${track.info.author}) ${track.info.title}`;
                        choices.push({
                            name: title.slice(0, 100),
                            value: `${position}`
                        });
                    });
                } else {
                    // ค้นหาเพลงในคิวที่ตรงกับ query
                    queueTracks.forEach((track, index) => {
                        const position = index + 1;
                        const trackTitle = track.info.title.toLowerCase();
                        const trackAuthor = track.info.author.toLowerCase();
                        const searchQuery = query.toLowerCase();
                        
                        if (trackTitle.includes(searchQuery) || trackAuthor.includes(searchQuery) || position.toString().includes(query)) {
                            const title = `${position}. (${track.info.author}) ${track.info.title}`;
                            choices.push({
                                name: title.slice(0, 100),
                                value: `${position}`
                            });
                        }
                    });
                    
                    // ถ้าไม่เจอเพลงที่ค้นหา
                    if (choices.length === 0) {
                        choices.push({ name: 'ไม่พบเพลงที่ค้นหาในคิว', value: 'not_found_error' });
                    }
                }
            }
        } catch (error) {
            console.error('Autocomplete error:', error);
            choices.push({ name: 'เกิดข้อผิดพลาดในการแสดงคิว', value: 'error' });
        }

        await interaction.respond(choices.slice(0, 25)).catch(() => {});
    },
    run: async (client: clientBot, interaction: ChatInputCommandInteraction) => {
        if(!client.manager.initiated) 
            return interaction.reply({ content: 'The bot is not ready yet. Please try again later.', flags: MessageFlags.Ephemeral });

        const songPosition = interaction.options.get('song').value as string;
        const member = interaction.member as GuildMember;
        const userAvatar = interaction.user.displayAvatarURL();

        // ตรวจสอบว่ามี player หรือไม่
        const player = client.manager.players.get(interaction.guild.id);

        // เช็คเงื่อนไขต่างๆ
        if (!member.voice || !member.voice.channel) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` กรุณาเข้าห้องเสียงด้วย`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } else if (player && interaction.guild.members.me.voice.channel && (member.voice.channelId !== interaction.guild.members.me.voice.channelId)) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` คุณต้องอยู่ในห้องเดียวกับบอท`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } else if (!player || (!player.playing && !player.paused) || songPosition === 'no_queue_error') {
            const embed = new EmbedBuilder()
                .setDescription(`> \`❌\` ไม่มีเพลงในคิว`)
                .setColor(configjson.embed_fail as HexColorString);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } else if (player.queue.size === 0 || songPosition === 'empty_queue_error') {
            const embed = new EmbedBuilder()
                .setDescription(`> \`❌\` คิวว่างเปล่า`)
                .setColor(configjson.embed_fail as HexColorString);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } else if (songPosition === 'not_found_error') {
            const embed = new EmbedBuilder()
                .setDescription(`> \`❌\` ไม่พบเพลงที่ค้นหาในคิว`)
                .setColor(configjson.embed_fail as HexColorString);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } else if (songPosition === 'error') {
            const embed = new EmbedBuilder()
                .setDescription(`> \`❌\` เกิดข้อผิดพลาดในการเข้าถึงคิว`)
                .setColor(configjson.embed_fail as HexColorString);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        try {
            const position = parseInt(songPosition) - 1; // แปลงเป็น index (เริ่มจาก 0)
            
            // ตรวจสอบว่า position ถูกต้องหรือไม่
            if (isNaN(position) || position < 0 || position >= player.queue.size) {
                const embed = new EmbedBuilder()
                    .setColor(configjson.embed_fail as HexColorString)
                    .setDescription(`> \`❌\` ตำแหน่งเพลงไม่ถูกต้อง`);

                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            // ดึงเพลงจาก queue
            const queueArray = [...player.queue];
            const selectedTrack = queueArray[position];

            if (!selectedTrack) {
                const embed = new EmbedBuilder()
                    .setColor(configjson.embed_fail as HexColorString)
                    .setDescription(`> \`❌\` ไม่พบเพลงในตำแหน่งที่เลือก`);

                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            // สร้างคิวใหม่โดยย้ายเพลงที่เลือกมาด้านหน้า
            player.queue.clear();

            // เพิ่มเพลงที่เลือกเป็นเพลงแรก
            player.queue.add(selectedTrack);

            // เพิ่มเพลงอื่นๆ กลับเข้าคิว (ยกเว้นเพลงที่เลือก)
            queueArray.forEach((track, index) => {
                if (index !== position) {
                    player.queue.add(track);
                }
            });

            // หยุดเพลงปัจจุบันเพื่อเล่นเพลงใหม่
            player.stop();

            // สร้าง Embed และแสดงผล
            const userMention = interaction.user.toString();
            const iconURL = await getIconURL(selectedTrack, userAvatar);

            const embed = new EmbedBuilder()
                .setColor(configjson.embed_color as HexColorString)
                .setAuthor({ name: 'Go to Page', iconURL: iconURL, url: selectedTrack.info.uri })
                .setDescription(`\`⏭️\`┃**Skipped ไปคิวเพลง** **[${selectedTrack.info.title}](${selectedTrack.info.uri})** \` ${convertTime(selectedTrack.info.length)} \` โดย: ${userMention}`)
                // .setThumbnail(selectedTrack.info.thumbnail);

            return interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Playnow error:', error);
            
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` เกิดข้อผิดพลาดในการเล่นเพลง`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    }
}
