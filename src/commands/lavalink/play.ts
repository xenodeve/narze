import { ApplicationCommandOptionType, ApplicationCommandType, ChatInputCommandInteraction, GuildMember, TextChannel, VoiceChannel, EmbedBuilder, HexColorString, MessageFlags, AutocompleteInteraction, PermissionsBitField } from "discord.js";
import { clientBot } from "../../interfaces/client";
import { loadTracks, playerCreate } from "../../functions/lavalink/manager";
import configjson from "../../config/config.json";
import { convertTime } from "../../functions/convertTime/convertTime";
import chalk from "chalk";
import { getPlaylistThumbnailMain, isPlaylistUrl } from "../../functions/youtube/index";
import { addPlaylistMetadata } from "../../functions/lavalink/playlistMetadata";
import { getIconURL, getPlaylistDisplayIcon } from "../../functions/lavalink/iconConfig";
import { checkVoiceChannelAccess } from "../../functions/lavalink/voicePermissions";

let mix = false;

export default {
    name: 'play',
    description: 'เล่น | เพิ่มคิว',
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: 'query',
            description: 'ชื่อเพลง | ลิ้งก์',
            type: ApplicationCommandOptionType.String,
            required: true,
            autocomplete: true
        }
    ],
    autocomplete: async (client: clientBot, interaction: AutocompleteInteraction) => {
        const query = interaction.options.getString('query');
        const member = interaction.member as GuildMember;
        const choices = [];

        try {
            if (!query) {
                choices.push({ name: 'กรุณาระบุเพลง', value: 'no_song' });
            } else if (query.startsWith('https://')) {
                if (query.includes('deezer') || query.includes('music.apple')) {
                    choices.push({ name: 'ไม่รองรับ Platform นี้', value: 'error' });
                } else {
                    // ใช้ loadTracks โดยตรงสำหรับ URL โดยไม่ต้องสร้าง player
                    const result = await loadTracks(query, member);
                    
                    if (result.loadType === 'error' || result.loadType === 'no_results') {
                        choices.push({ name: '(ข้อผิดพลาด) กรุณาใส่ URL ที่ถูกต้อง', value: 'error' });
                    } else if (result.loadType === 'playlist') {
                        let playlistId;
                        let playlistName: string | null = null;

                        if (result.playlistInfo.name.includes('Mix - ')) {
                            playlistName = result.playlistInfo.name.replace('Mix - ','สถานีวิทยุ')
                            mix = true;
                        }
                        if (mix) {
                            playlistId = query;
                            console.log(playlistId);
                        } else if(query.includes('list=') && ((query.includes('youtube') || query.includes('youtu.be')))){
                            playlistId = `https://music.youtube.com/playlist?list=${query.split("list=")[1]}`;
                            console.log(playlistId);
                        } else {
                            playlistId = query;
                        }
                        
                        const title = `(${result.tracks.length} เพลง) ${playlistName || result.playlistInfo.name}`;
                        choices.push({ name: title.slice(0, 100), value: playlistId });
                    } else if (result.tracks && result.tracks.length > 0 && query.includes('music.youtube')) {
                        const title = `(${result.tracks[0].info.author}) ${result.tracks[0].info.title}`;
                        choices.push({ name: title.slice(0, 100), value: title.slice(0, 100) });
                    } else if (result.tracks && result.tracks.length > 0 && (query.includes('youtu.be') || query.includes('youtube') || query.includes('spotify'))) {
                        const title = `(${result.tracks[0].info.author}) ${result.tracks[0].info.title}`;
                        choices.push({ name: title.slice(0, 100), value: result.tracks[0].info.uri || query });
                    }
                }
            } else {
                // Search สำหรับ text query โดยไม่ต้องสร้าง player
                const result = await loadTracks(query, member);
                
                if (result.tracks && result.tracks.length > 0) {
                    for (let i = 0; i < Math.min(7, result.tracks.length); i++) {
                        const track = result.tracks[i];
                        const title = `(${track.info.author}) ${track.info.title}`;
                        choices.push({
                          name: title.slice(0, 100),
                          value: title.slice(0, 100),
                        });
                    }
                } else {
                    choices.push({ name: 'ไม่พบเพลงที่ค้นหา', value: 'error' });
                }
            }
        } catch (error) {
            console.error('Autocomplete error:', error);
            choices.push({ name: 'เกิดข้อผิดพลาดในการค้นหา', value: 'error' });
        }

        await interaction.respond(choices).catch(() => {});
    },
    run: async (client: clientBot, interaction: ChatInputCommandInteraction) => {
        if(!client.manager.initiated) 
            return interaction.reply({ content: 'The bot is not ready yet. Please try again later.', flags: MessageFlags.Ephemeral });

        const query = interaction.options.get('query').value as string;
        const member = interaction.member as GuildMember;
        const userAvatar = interaction.user.displayAvatarURL();

        let queryFiltered;

        if(mix){
            queryFiltered = query;
            mix = false;
        } else if(query.includes('list=') && (query.includes('youtube') || query.includes('youtu.be'))){
            queryFiltered = `https://music.youtube.com/playlist?list=${query.split("list=")[1]}`;
            console.log(`[${chalk.bold.yellowBright("DEBUG")}] queryFiltered : ${queryFiltered}`);
        } else {
            queryFiltered = query;
        }

        console.log(`[${chalk.bold.yellowBright('DEBUG')}] Received query:`, queryFiltered);

        // เช็ค voice channel อย่างถูกต้อง
        if (!member.voice || !member.voice.channel) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` กรุณาเข้าห้องเสียงด้วย`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        } else if (interaction.guild.members.me.voice.channel && (member.voice.channelId !== interaction.guild.members.me.voice.channelId)) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\`กรุณาอยู่ในห้องเสียงเดียวกับบอท`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        }

        // ตรวจสอบ permission สำหรับการเข้าห้องเสียง
        const voiceChannel = member.voice.channel as VoiceChannel;
        const permissionCheck = checkVoiceChannelAccess(voiceChannel, interaction.guild.members.me);
        
        if (!permissionCheck.canAccess) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` บอทไม่มีอำนาจเปิดเพลงในห้อง ${voiceChannel.toString()}`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        if (!queryFiltered || queryFiltered === 'no_song') {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\`กรุณาระบุเพลง`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        } else if (queryFiltered === 'error') {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\`กรุณาระบุเพลงที่ถูกต้อง`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        } else if (queryFiltered.includes('deezer') || queryFiltered.includes('music.apple')) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\`ไม่รองรับ Platform นี้`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        }

        loadTracks(queryFiltered, member).then(async (result) => {
            const player = playerCreate(interaction.guild, interaction.channel as TextChannel, member.voice.channel as VoiceChannel);

            await (player as any).setVolume(configjson.lavalink_config.volume_default);

            // เซ็ต flag ว่าเป็นเพลงแรกจากคำสั่ง play
            (player as any).set('isFirstFromCommand', true);
      
            // แทรก interaction เข้าไปใน client collection
            client.interactions.set(`play`, {
                interaction: interaction,
                command: 'play',
                query: queryFiltered,
                guild: interaction.guild,
                member: member,
                timestamp: Date.now()
            });

            console.log(`[${chalk.bold.yellowBright('DEBUG')}] result loadtype:`, chalk.yellowBright(result.loadType));

            if(!player.playing){
                player.connect();
            }

            if(result.loadType === 'track' || result.loadType === 'search') {
                player.queue.add(result.tracks[0]);

                console.log('author', result.tracks[0].info.author);

                if(result.tracks[0].info.uri.includes('youtube')) {
                    result.tracks[0].info.uri = result.tracks[0].info.uri.replace('www', 'music');
                }

                console.log(result.tracks[0].info.uri);

                if(player.playing || player.paused) {
                    const iconURL = await getIconURL(result.tracks[0], userAvatar);
                    const embed = new EmbedBuilder()
                        .setColor(configjson.embed_color as HexColorString)
                        .setAuthor({ name: 'Go to Page', iconURL: iconURL, url: result.tracks[0].info.uri })
                        .setDescription(`\`📝\`┃**${result.tracks[0].info.title}** \` ${convertTime(result.tracks[0].info.length)} \` \n > ลำดับ: \` ${player.queue.size} \``)
                        .setThumbnail(result.tracks[0].info.thumbnail)
                    return interaction.reply({ embeds: [embed] });
                }

                if(!player.playing && !player.paused) 
                    player.play().catch(() => {
                    return interaction.reply('ไม่สามารถเล่นเพลงได้');
                }).then(async () => {
                    const iconURL = await getIconURL(result.tracks[0], userAvatar);
                    const embed = new EmbedBuilder()
                        .setColor(configjson.embed_color as HexColorString)
                        .setAuthor({ name: 'Go to Page', iconURL: iconURL, url: result.tracks[0].info.uri })
                        .setDescription(`\`▶️\`┃**${result.tracks[0].info.title}** \` ${convertTime(result.tracks[0].info.length)} \``)
                        .setThumbnail(result.tracks[0].info.thumbnail)
                    return interaction.reply({ embeds: [embed] });
                }) 

            } else if(result.loadType === 'no_results') {
                const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\`ไม่สามารถหาเพลงได้`);
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            if(result.loadType === 'playlist') {
                // คำนวณเวลารวมของ playlist
                const totalDuration = result.tracks.reduce((total, track) => {
                    return total + (track.info.length || 0);
                }, 0);

                // ดึง playlist thumbnail
                let thumbnailUrl: string | null = null;

                let playlistName: string | null = null;

                if (result.playlistInfo.name.includes('Mix - ')) {
                    playlistName = result.playlistInfo.name.replace('Mix - ','สถานีวิทยุ')
                }
                
                console.log(`queryFiltered for thumbnail:`, queryFiltered);
                
                try {
                    // ใช้ฟังก์ชันหลักที่รวมทุกวิธีเข้าด้วยกัน
                    const videoThumbnail = result.tracks[0]?.info?.thumbnail;
                    thumbnailUrl = await getPlaylistThumbnailMain(queryFiltered, videoThumbnail, {
                        method: 'auto',
                        fallbackToVideo: true,
                        highQuality: true
                    });
                } catch (error) {
                    console.error('Error fetching playlist thumbnail:', error);
                    // Fallback ให้ใช้ thumbnail จากเพลงแรก
                    if (result.tracks[0]?.info?.thumbnail.includes('mqdefault')) {
                        thumbnailUrl = result.tracks[0].info.thumbnail.replace('mqdefault', 'maxresdefault');
                    }
                }

                console.log(`[${chalk.bold.yellowBright('DEBUG')}] Final thumbnailUrl:`, thumbnailUrl);

                result.tracks.forEach(track => {
                // เปลี่ยน uri ด้วยถ้าต้องการ
                if(track.info.uri.includes('youtube')) {
                    track.info.uri = track.info.uri.replace('www', 'music');
                }});

                // เพิ่ม playlist metadata ลงใน tracks (รวม playlist thumbnail)
                const tracksWithMetadata = addPlaylistMetadata(
                    result.tracks, 
                    playlistName || result.playlistInfo.name, 
                    queryFiltered,
                    thumbnailUrl
                );

                tracksWithMetadata.forEach(track => {
                    player.queue.add(track);
                });

                // console.log(result)

                if(player.playing || player.paused) {
                    // ดึงชื่อศิลปินจากเพลงแรกเพื่อใช้กับ artistImage
                    const firstTrackArtist = result.tracks[0]?.info?.author;
                    const iconURL = await getPlaylistDisplayIcon(thumbnailUrl, userAvatar, firstTrackArtist);
                    const embed = new EmbedBuilder()
                        .setColor(configjson.embed_color as HexColorString)
                        .setAuthor({ name: 'Go to Playlist', iconURL: iconURL, url: queryFiltered })
                        .setDescription(`> \`📝\` **Playlist:** ${playlistName || result.playlistInfo.name}\n> \`⌛\` **เวลา:** \` ${convertTime(totalDuration)} \` \n> \`📊\` **มี:** \` ${result.tracks.length} \` เพลง \n> **คิวทั้งหมด:** \` ${player.queue.size} \` เพลง \n> **ห้อง:** ${member.voice.channel.toString()}`)
                        .setThumbnail(thumbnailUrl);

                    return interaction.reply({ embeds: [embed] });
                }

                // console.log('result', result)

                if(!player.playing && !player.paused) 
                    player.play().catch(() => {
                        const embed = new EmbedBuilder()
                            .setColor(configjson.embed_color as HexColorString)
                            .setDescription(`> \`❌\` **ไม่สามารถเล่นเพลงได้**`)

                        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                }).then( async() => {
                    // ดึงชื่อศิลปินจากเพลงแรกเพื่อใช้กับ artistImage
                    const firstTrackArtist = result.tracks[0]?.info?.author;
                    const iconURL = await getPlaylistDisplayIcon(thumbnailUrl, userAvatar, firstTrackArtist);
                    const embed = new EmbedBuilder()
                        .setColor(configjson.embed_color as HexColorString)
                        .setAuthor({ name: 'Go to Playlist', iconURL: iconURL, url: queryFiltered })
                        .setDescription(`> \`📙\` **Playlist:** ${playlistName || result.playlistInfo.name}\n> \`⌛\` **เวลา:** \` ${convertTime(totalDuration)} \` \n> \`📊\` **มี:** \` ${result.tracks.length} \` เพลง \n> **ห้อง:** ${member.voice.channel.toString()}`)
                        .setThumbnail(thumbnailUrl);

                    return interaction.reply({ embeds: [embed] });
            });
                
            } else if(result.loadType === 'no_results') {
                const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` **ไม่สามารถหาเพลงได้**`);
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            if(result.loadType === 'error') {
                console.log(`[${chalk.bold.redBright('NODE')}] ${result.exception.message}`);
            }
        })
        
    }
}