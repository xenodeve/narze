import { ApplicationCommandOptionType, ApplicationCommandType, ChatInputCommandInteraction, GuildMember, TextChannel, VoiceChannel, EmbedBuilder, HexColorString, MessageFlags, AutocompleteInteraction } from "discord.js";
import { clientBot } from "../../interfaces/client";
import { loadTracks, playerCreate } from "../../functions/lavalink/manager";
import configjson from "../../config/config.json";
import { convertTime } from "../../functions/convertTime/convertTime";
import chalk from "chalk";
import { getPlaylistThumbnailMain } from "../../functions/youtube/index";
import { addPlaylistMetadata } from "../../functions/lavalink/playlistMetadata";
import { getIconURL, getPlaylistDisplayIcon } from "../../functions/lavalink/iconConfig";
import { checkVoiceChannelAccess } from "../../functions/lavalink/voicePermissions";
import { validateAndConvertThumbnail } from "../../functions/lavalink/thumbnailValidator";
import { getCache, setCache } from "../../functions/cache/autocompleteCache";

// ฟังก์ชันสำหรับสร้าง cache key ตาม search platform
function getCacheKey(query: string): string {
    const platform = configjson.lavalink_config.default_search_platform;
    return `autocomplete_${platform}_${query}`;
}

let mix = false;

export default {
    name: 'playat',
    description: 'เพิ่มเพลงในตำแหน่งที่เลือก',
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: 'query',
            description: 'ชื่อเพลง | ลิ้งก์',
            type: ApplicationCommandOptionType.String,
            required: true,
            autocomplete: true
        },
        {
            name: 'position',
            description: 'ตำแหน่งในคิวที่ต้องการแทรก',
            type: ApplicationCommandOptionType.String,
            required: true,
            autocomplete: true
        }
    ],
    autocomplete: async (client: clientBot, interaction: AutocompleteInteraction) => {
        const focusedOption = interaction.options.getFocused(true);
        const query = interaction.options.getString('query');
        const position = interaction.options.getString('position');
        const member = interaction.member as GuildMember;
        const choices = [];

        try {
            // Autocomplete สำหรับ query (เพลง)
            if (focusedOption.name === 'query') {
                if (!query) {
                    choices.push({ name: 'กรุณาระบุเพลง', value: 'no_song' });
                } else if (query.startsWith('https://')) {
                    if (query.includes('deezer') || query.includes('music.apple')) {
                        choices.push({ name: 'ไม่รองรับ Platform นี้', value: 'error' });
                    } else {
                        // ตรวจสอบ cache ก่อน (แยกตาม search platform)
                        const cacheKey = getCacheKey(query);
                        const cachedResult = getCache(cacheKey);
                        
                        if (cachedResult) {
                            const platform = configjson.lavalink_config.default_search_platform;
                            console.log(`[${chalk.bold.greenBright('CACHE')}] Using cached result (${platform}) for: ${query}`);
                            await interaction.respond(cachedResult).catch(() => {});
                            return;
                        }

                        // ใช้ loadTracks โดยตรงสำหรับ URL
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
                            } else if(query.includes('list=') && ((query.includes('youtube') || query.includes('youtu.be')))){
                                playlistId = `https://music.youtube.com/playlist?list=${query.split("list=")[1]}`;
                            } else {
                                playlistId = query;
                            }
                            
                            const title = `(${result.tracks.length} เพลง) ${playlistName || result.playlistInfo.name}`;
                            choices.push({ name: title.slice(0, 100), value: playlistId });
                        } else if (result.tracks && result.tracks.length > 0 && query.includes('music.youtube')) {
                            const title = `(${result.tracks[0].info.author}) ${result.tracks[0].info.title}`;
                            choices.push({ name: title.slice(0, 100), value: title.slice(0, 100) + query });
                        } else if (result.tracks && result.tracks.length > 0 && (query.includes('youtu.be') || query.includes('youtube') || query.includes('spotify'))) {
                            const title = `(${result.tracks[0].info.author}) ${result.tracks[0].info.title}`;
                            choices.push({ name: title.slice(0, 100), value: result.tracks[0].info.uri || query });
                        }
                        
                        // บันทึกผลลัพธ์ลง cache สำหรับ URL (เฉพาะถ้าไม่ใช่ error)
                        if (choices.length > 0 && !choices.some(choice => choice.value === 'error')) {
                            setCache(cacheKey, choices);
                            const platform = configjson.lavalink_config.default_search_platform;
                            console.log(`[${chalk.bold.blueBright('CACHE')}] Cached URL result (${platform}) for: ${query}`);
                        }
                    }
                } else {
                    // ตรวจสอบ cache ก่อน (สำหรับ text search) - แยกตาม search platform
                    const cacheKey = getCacheKey(query);
                    const cachedResult = getCache(cacheKey);
                    
                    if (cachedResult) {
                        const platform = configjson.lavalink_config.default_search_platform;
                        console.log(`[${chalk.bold.greenBright('CACHE')}] Using cached result (${platform}) for: ${query}`);
                        await interaction.respond(cachedResult).catch(() => {});
                        return;
                    }

                    // Search สำหรับ text query
                    const result = await loadTracks(query, member);
                    
                    if (result.tracks && result.tracks.length > 0) {
                        for (let i = 0; i < Math.min(configjson.lavalink_config.autocomplete_results_limit, result.tracks.length); i++) {
                            const track = result.tracks[i];
                            const title = `(${track.info.author}) ${track.info.title}`;
                            choices.push({
                              name: title.slice(0, 100),
                              value: title.slice(0, 100) + track.info.uri,
                            });
                        }
                        
                        // บันทึกผลลัพธ์ลง cache สำหรับ text search
                        setCache(cacheKey, choices);
                        const platform = configjson.lavalink_config.default_search_platform;
                        console.log(`[${chalk.bold.blueBright('CACHE')}] Cached text search result (${platform}) for: ${query}`);
                    } else {
                        choices.push({ name: 'ไม่พบเพลงที่ค้นหา', value: 'error' });
                    }
                }
            }

            // Autocomplete สำหรับ position (ตำแหน่งในคิว)
            if (focusedOption.name === 'position') {
                const player = client.manager.players.get(interaction.guild.id);
                
                if (!player || (!player.playing && !player.paused)) {
                    choices.push({ name: 'ไม่มีเพลงในคิว - แทรกเป็นเพลงแรก', value: '1' });
                } else {
                    // แสดงตำแหน่งที่สามารถแทรกได้
                    const currentQueueSize = player.queue.size;
                    const searchQuery = position?.toLowerCase() || '';
                    
                    // ตำแหน่งเริ่มต้น
                    const positions = [
                        { name: '1. ถัดจากเพลงปัจจุบัน (ลำดับแรก)', value: '1' },
                        { name: `${currentQueueSize + 1}. ท้ายคิว`, value: `${currentQueueSize + 1}` }
                    ];

                    // เพิ่มตำแหน่งอื่นๆ ในคิว
                    for (let i = 2; i <= currentQueueSize; i++) {
                        positions.push({
                            name: `${i}. ลำดับที่ ${i}`,
                            value: `${i}`
                        });
                    }

                    // กรองตามการค้นหา
                    if (!position || position.length === 0) {
                        // แสดงตำแหน่งหลักๆ
                        choices.push(...positions.slice(0, 10));
                    } else {
                        // ค้นหาตำแหน่งที่ตรงกับ query
                        const filteredPositions = positions.filter(pos => 
                            pos.name.toLowerCase().includes(searchQuery) || 
                            pos.value.includes(position)
                        );
                        
                        if (filteredPositions.length > 0) {
                            choices.push(...filteredPositions.slice(0, 25));
                        } else {
                            choices.push({ name: 'ไม่พบตำแหน่งที่ค้นหา', value: 'not_found_error' });
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Autocomplete error:', error);
            choices.push({ name: 'เกิดข้อผิดพลาดในการค้นหา', value: 'error' });
        }

        // บันทึกผลลัพธ์ลง cache (เฉพาะถ้าไม่ใช่ error และเป็น query search)
        if (focusedOption.name === 'query' && choices.length > 0 && !choices.some(choice => choice.value === 'error')) {
            const cacheKey = getCacheKey(query);
            const platform = configjson.lavalink_config.default_search_platform;
            // ผลลัพธ์ถูก cache แล้วข้างบนแล้ว เพียงแค่เพิ่ม log
            console.log(`[${chalk.bold.blueBright('CACHE')}] Results ready (${platform}) for: ${query}`);
        }

        await interaction.respond(choices.slice(0, 25)).catch(() => {});
    },
    run: async (client: clientBot, interaction: ChatInputCommandInteraction) => {
        if(!client.manager.initiated) 
            return interaction.reply({ content: 'The bot is not ready yet. Please try again later.', flags: MessageFlags.Ephemeral });

        const query = interaction.options.get('query').value as string;
        const positionStr = interaction.options.get('position').value as string;
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

        console.log(`[${chalk.bold.yellowBright('DEBUG')}] Received query for playat:`, queryFiltered);
        console.log(`[${chalk.bold.yellowBright('DEBUG')}] Position:`, positionStr);

        // เช็ค voice channel อย่างถูกต้อง
        if (!member.voice || !member.voice.channel) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` กรุณาเข้าห้องเสียงด้วย`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        } else if (interaction.guild.members.me.voice.channel && (member.voice.channelId !== interaction.guild.members.me.voice.channelId)) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` กรุณาอยู่ในห้องเสียงเดียวกับบอท`);

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
                .setDescription(`> \`❌\` กรุณาระบุเพลง`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        } else if (queryFiltered === 'error') {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` กรุณาระบุเพลงที่ถูกต้อง`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        } else if (queryFiltered.includes('deezer') || queryFiltered.includes('music.apple')) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` ไม่รองรับ Platform นี้`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        } else if (positionStr === 'not_found_error') {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` ไม่พบตำแหน่งที่เลือก`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        }

        // แปลงตำแหน่งเป็นตัวเลข
        const insertPosition = parseInt(positionStr);
        if (isNaN(insertPosition) || insertPosition < 1) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` ตำแหน่งไม่ถูกต้อง`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        await loadTracks(queryFiltered, member).then(async (result) => {
            const player = playerCreate(interaction.guild, interaction.channel as TextChannel, member.voice.channel as VoiceChannel);

            // ตั้งค่า volume เริ่มต้นก่อนเริ่มเล่น
            if (player.volume === 100 && !(player as any).get('isVolumeChangeCommand')) {
                player.setVolume(configjson.lavalink_config.volume_default);
            }

            console.log(`[${chalk.bold.yellowBright('DEBUG')}] result loadtype:`, chalk.yellowBright(result.loadType));

            if(!player.playing){
                player.connect();
            }

            // ฟังก์ชันสำหรับแทรกเพลงในตำแหน่งที่กำหนด
            const insertTracksAtPosition = (tracks: any[], position: number) => {
                const queueArray = [...player.queue];
                player.queue.clear();

                // ถ้าไม่มีเพลงในคิวหรือแทรกที่ตำแหน่งแรก
                if (queueArray.length === 0 || position === 1) {
                    tracks.forEach(track => player.queue.add(track));
                    queueArray.forEach(track => player.queue.add(track));
                    return;
                }

                // แทรกในตำแหน่งอื่นๆ
                const actualPosition = Math.min(position - 1, queueArray.length);
                
                // เพิ่มเพลงก่อนตำแหน่งที่จะแทรก
                for (let i = 0; i < actualPosition; i++) {
                    player.queue.add(queueArray[i]);
                }
                
                // เพิ่มเพลงใหม่
                tracks.forEach(track => player.queue.add(track));
                
                // เพิ่มเพลงที่เหลือ
                for (let i = actualPosition; i < queueArray.length; i++) {
                    player.queue.add(queueArray[i]);
                }
            };

            if(result.loadType === 'track' || result.loadType === 'search') {
                
                if(result.tracks[0].info.uri.includes('youtube')) {
                    result.tracks[0].info.uri = result.tracks[0].info.uri.replace('www', 'music');
                }

                // ถ้าไม่มีเพลงกำลังเล่น ให้เพิ่มเพลงปกติ
                if(!player.playing && !player.paused) {

                    (player as any).set('dontShow', true); // ไม่ต้องแสดง trackStart Embed ตอนเริ่มเล่นเพลง

                    player.queue.add(result.tracks[0]);
                    player.play().catch(() => {
                        const embed = new EmbedBuilder()
                            .setColor(configjson.embed_fail as HexColorString)
                            .setDescription(`> \`❌\` ตำแหน่งไม่ถูกต้อง`);
                        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                    }).then(async () => {
                        const iconURL = await getIconURL(result.tracks[0], userAvatar);
                        const validatedThumbnail = await validateAndConvertThumbnail(result.tracks[0].info.thumbnail);
                        const embed = new EmbedBuilder()
                            .setColor(configjson.embed_color as HexColorString)
                            .setAuthor({ name: 'Go to Page', iconURL: iconURL, url: result.tracks[0].info.uri })
                            .setDescription(`\`▶️\`┃**${result.tracks[0].info.title}** \` ${convertTime(result.tracks[0].info.length)} \``)
                            .setThumbnail(validatedThumbnail)
                        return interaction.reply({ embeds: [embed] });
                    });
                } else {
                    // ถ้ามีเพลงกำลังเล่น ให้แทรกในตำแหน่งที่กำหนด
                    insertTracksAtPosition([result.tracks[0]], insertPosition);

                    const actualPosition = Math.min(insertPosition, player.queue.size);
                    const iconURL = await getIconURL(result.tracks[0], userAvatar);
                    const validatedThumbnail = await validateAndConvertThumbnail(result.tracks[0].info.thumbnail);
                    const embed = new EmbedBuilder()
                        .setColor(configjson.embed_color as HexColorString)
                        .setAuthor({ name: 'Go to Page', iconURL: iconURL, url: result.tracks[0].info.uri })
                        .setDescription(`\`📝\`┃**${result.tracks[0].info.title}** \` ${convertTime(result.tracks[0].info.length)} \` \n > ลำดับ: \` ${actualPosition} \``)
                        .setThumbnail(validatedThumbnail)
                    return interaction.reply({ embeds: [embed] });
                }

            } else if(result.loadType === 'no_results') {
                const embed = new EmbedBuilder()
                    .setColor(configjson.embed_fail as HexColorString)
                    .setDescription(`> \`❌\` ไม่สามารถหาเพลงได้`);
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            if(result.loadType === 'playlist') {
                await interaction.deferReply();
                
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
                    thumbnailUrl = await validateAndConvertThumbnail(result.tracks[0]?.info?.thumbnail);
                }

                console.log(`[${chalk.bold.yellowBright('DEBUG')}] Final thumbnailUrl:`, thumbnailUrl);

                await result.tracks.forEach(track => {
                    // เปลี่ยน uri ด้วยถ้าต้องการ
                    if(track.info.uri.includes('youtube')) {
                        track.info.uri = track.info.uri.replace('www', 'music');
                    }
                });

                // เพิ่ม playlist metadata ลงใน tracks (รวม playlist thumbnail)
                const tracksWithMetadata = addPlaylistMetadata(
                    result.tracks, 
                    playlistName || result.playlistInfo.name, 
                    queryFiltered,
                    thumbnailUrl
                );

                // ถ้าไม่มีเพลงกำลังเล่น ให้เพิ่ม playlist ปกติ
                if(!player.playing && !player.paused) {
                    await tracksWithMetadata.forEach(track => {
                        player.queue.add(track);
                    });

                    player.play().catch(() => {
                        const embed = new EmbedBuilder()
                            .setColor(configjson.embed_color as HexColorString)
                            .setDescription(`> \`❌\` **ไม่สามารถเล่นเพลงได้**`)

                        return interaction.editReply({ embeds: [embed] });
                    }).then(async () => {
                        // ดึงชื่อศิลปินจากเพลงแรกเพื่อใช้กับ artistImage
                        const firstTrackArtist = result.tracks[0]?.info?.author;
                        const iconURL = await getPlaylistDisplayIcon(thumbnailUrl, userAvatar, firstTrackArtist);
                        const embed = new EmbedBuilder()
                            .setColor(configjson.embed_color as HexColorString)
                            .setAuthor({ name: 'Go to Playlist', iconURL: iconURL, url: queryFiltered })
                            .setDescription(`> \`📙\` **Playlist:** ${playlistName || result.playlistInfo.name}\n> \`⌛\` **เวลา:** \` ${convertTime(totalDuration)} \` \n> \`📊\` **มี:** \` ${result.tracks.length} \` เพลง \n> **ห้อง:** ${member.voice.channel.toString()}`)
                            .setThumbnail(thumbnailUrl);

                        return interaction.editReply({ embeds: [embed] });
                    });
                } else {
                    // ถ้ามีเพลงกำลังเล่น ให้แทรก playlist ในตำแหน่งที่กำหนด
                    insertTracksAtPosition(tracksWithMetadata, insertPosition);

                    const actualPosition = Math.min(insertPosition, player.queue.size - tracksWithMetadata.length + 1);
                    // ดึงชื่อศิลปินจากเพลงแรกเพื่อใช้กับ artistImage
                    const firstTrackArtist = result.tracks[0]?.info?.author;
                    const iconURL = await getPlaylistDisplayIcon(thumbnailUrl, userAvatar, firstTrackArtist);
                    const embed = new EmbedBuilder()
                        .setColor(configjson.embed_color as HexColorString)
                        .setAuthor({ name: 'Go to Playlist', iconURL: iconURL, url: queryFiltered })
                        .setDescription(`> \`📝\` **Playlist:** ${playlistName || result.playlistInfo.name}\n> \`⌛\` **เวลา:** \` ${convertTime(totalDuration)} \` \n> \`📊\` **มี:** \` ${result.tracks.length} \` เพลง \n> **ลำดับ:** \` ${actualPosition} ถึง ${actualPosition + result.tracks.length} \` \n> **คิวทั้งหมด:** \` ${player.queue.size} \` เพลง \n> **ห้อง:** ${member.voice.channel.toString()}`)
                        .setThumbnail(thumbnailUrl);

                    return interaction.editReply({ embeds: [embed] });
                }
                
            } else if(result.loadType === 'no_results') {
                const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` **ไม่สามารถหาเพลงได้**`);
                return interaction.editReply({ embeds: [embed] });
            }

            if(result.loadType === 'error') {
                console.log(`[${chalk.bold.redBright('NODE')}] ${result.exception.message}`);
            }
        })
        
    }
}
