import { ApplicationCommandOptionType, ApplicationCommandType, ChatInputCommandInteraction, GuildMember, TextChannel, VoiceChannel, EmbedBuilder, HexColorString, MessageFlags, AutocompleteInteraction } from "discord.js";
import { clientBot } from "../../interfaces/client";
import { loadTracks, playerCreate } from "../../functions/lavalink/manager";
import configjson from "../../config/config.json";
import { convertTime } from "../../functions/convertTime/convertTime";
import chalk from "chalk";
import { client } from "../..";
import { addPlaylistMetadata } from "../../functions/lavalink/playlistMetadata";
import { getPlaylistThumbnailMain } from "../../functions/youtube/index";
import { getPlaylistDisplayIcon } from "../../functions/lavalink/iconConfig";
import { getCache, setCache } from "../../functions/cache/autocompleteCache";

// ฟังก์ชันสำหรับสร้าง cache key ตาม search platform
function getCacheKey(query: string): string {
    const platform = configjson.lavalink_config.default_search_platform;
    return `autocomplete_${platform}_${query}`;
}

let mix = false;

export default {
    name: 'skipplay',
    description: 'ลัดคิวเล่นทันที',
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

        // ตรวจสอบว่ามี player หรือไม่
        const player = client.manager.players.get(interaction.guild.id);

        try {
            if (!player || (!player.playing && !player.paused)) {
                choices.push({ name: 'ไม่มีเพลงก่อนหน้า ไม่สามารถใช้ skipplay ได้', value: 'nobeforsong_error' });
            } else if (!query) {
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
                        console.log(`[${chalk.bold.greenBright('CACHE')}] Using cached result (${platform}) for skipplay: ${query}`);
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
                            // console.log('mix :', playlistId);
                        } else if(query.includes('list=') && ((query.includes('youtube') || query.includes('youtu.be')))){
                            playlistId = `https://music.youtube.com/playlist?list=${query.split("list=")[1]}`;
                            // console.log(playlistId);
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
                        console.log(`[${chalk.bold.blueBright('CACHE')}] Cached URL result (${platform}) for skipplay: ${query}`);
                    }
                }
            } else {
                // ตรวจสอบ cache ก่อน (สำหรับ text search) - แยกตาม search platform
                const cacheKey = getCacheKey(query);
                const cachedResult = getCache(cacheKey);
                
                if (cachedResult) {
                    const platform = configjson.lavalink_config.default_search_platform;
                    console.log(`[${chalk.bold.greenBright('CACHE')}] Using cached result (${platform}) for skipplay: ${query}`);
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
                    console.log(`[${chalk.bold.blueBright('CACHE')}] Cached text search result (${platform}) for skipplay: ${query}`);
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
            // console.log('mix2 :', queryFiltered);
        } else if(query.includes('list=') && (query.includes('youtube') || query.includes('youtu.be'))){
            queryFiltered = `https://music.youtube.com/playlist?list=${query.split("list=")[1]}`;
            console.log(`[${chalk.bold.yellowBright("DEBUG")}] queryFiltered : ${queryFiltered}`);
        } else {
            queryFiltered = query;
        }

        // ตรวจสอบว่ามี player หรือไม่
        const player = client.manager.players.get(interaction.guild.id);

        // เช็คเงื่อนไขต่างๆ
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
        } else if (!member.voice || !member.voice.channel) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` กรุณาเข้าห้องเสียงด้วย`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } else if (player && interaction.guild.members.me.voice.channel && (member.voice.channelId !== interaction.guild.members.me.voice.channelId)) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` คุณต้องอยู่ในห้องเดียวกับบอท`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } else if (queryFiltered.includes('deezer') || queryFiltered.includes('music.apple')) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` ไม่รองรับ Platform นี้`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } else if (!player || (!player.playing && !player.paused) || queryFiltered === 'nobeforsong_error') {
            const embed = new EmbedBuilder()
                .setDescription(`> \`❌\` ไม่มีเพลงก่อนหน้า`)
                .setColor(configjson.embed_fail as HexColorString);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
        
        // console.log('skip:', queryFiltered);

        try {
            // ค้นหาเพลงที่ต้องการ skipplay
            const result = await loadTracks(queryFiltered, member);

            if (!result.tracks || result.tracks.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(configjson.embed_fail as HexColorString)
                    .setDescription(`> \`❌\` ไม่สามารถเข้าถึงเพลงได้`);

                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            console.log('Current queue before skipplay:', player.queue.size);
            
            // สำรองคิวปัจจุบัน (Queue extends Array)
            const currentQueue = [...player.queue];
            
            // ล้างคิวและเพิ่มเพลงใหม่ที่ต้องการ skipplay ไว้หน้าสุด
            player.queue.clear();

            (player as any).set('isSkipplay', true);
            
            if (result.loadType === 'playlist') {
                
                await interaction.deferReply();

                // ดึง playlist thumbnail
                const thumbnailUrl = await getPlaylistThumbnailMain(queryFiltered);

                let playlistName: string | null = null;

                if (result.playlistInfo.name.includes('Mix - ')) {
                    playlistName = result.playlistInfo.name.replace('Mix - ','สถานีวิทยุ')
                }

                result.tracks.forEach(track => {
                // เปลี่ยน uri ด้วยถ้าต้องการ
                if(track.info.uri.includes('youtube')) {
                    track.info.uri = track.info.uri.replace('www', 'music');
                }});
                
                // เพิ่ม playlist metadata ลงใน tracks รวมถึง thumbnail
                const tracksWithMetadata = addPlaylistMetadata(
                    result.tracks, 
                    playlistName || result.playlistInfo.name, 
                    queryFiltered,
                    thumbnailUrl
                );

                // เพิ่มทั้ง playlist
                await tracksWithMetadata.forEach(track => {
                    player.queue.add(track);
                });
                
                // เพิ่มคิวเก่ากลับ
                if (currentQueue.length > 0) {
                    currentQueue.forEach(track => {
                        player.queue.add(track);
                    });
                }

                // คำนวณเวลารวมของ playlist
                const totalDuration = result.tracks.reduce((total, track) => {
                    return total + (track.info.length || 0);
                }, 0);

                // skip เพลงปัจจุบันเพื่อไปเพลงใหม่
                player.stop();

                // ใช้ playlist thumbnail ถ้ามี หรือไม่งั้นใช้ thumbnail ของเพลงแรก
                const displayThumbnail = thumbnailUrl || result.tracks[0].info.thumbnail;
                // ดึงชื่อศิลปินจากเพลงแรกเพื่อใช้กับ artistImage
                const firstTrackArtist = result.tracks[0]?.info?.author;
                const iconURL = await getPlaylistDisplayIcon(thumbnailUrl, userAvatar, firstTrackArtist);
                const userMention = interaction.user.toString();
 
                const embed = new EmbedBuilder()
                    .setColor(configjson.embed_color as HexColorString)
                    .setAuthor({ name: 'Go to Playlist', iconURL: String(iconURL), url: queryFiltered })
                    .setDescription(`> \`⏭️\` **Skipped** ไปยัง **[${playlistName || result.playlistInfo.name}](${queryFiltered})** โดย ${userMention}\n> \`⌛\` **เวลา:** \` ${convertTime(totalDuration)} \` \n> \`📊\` **มี:** \` ${result.tracks.length} \` เพลง\n> **คิวทั้งหมด:** \` ${player.queue.size} \` เพลง \n`)
                    .setThumbnail(displayThumbnail);

                return interaction.editReply({ embeds: [embed] });
                
                
            } else {
                // เพิ่มเพลงเดียวที่ต้องการ skipplay
                player.queue.add(result.tracks[0]);

                if(result.tracks[0].info.uri.includes('youtube')) {
                    result.tracks[0].info.uri = result.tracks[0].info.uri.replace('www', 'music');
                }
                
                // เพิ่มคิวเก่ากลับ
                if (currentQueue.length > 0) {
                    currentQueue.forEach(track => {
                        player.queue.add(track);
                    });
                }

                console.log('Queue after skipplay:', player.queue.size);

                // skip เพลงปัจจุบันเพื่อไปเพลงใหม่
                player.stop();

                // สร้าง Embed และแสดงผล
                const userMention = interaction.user.toString();

                // สร้าง Embed และแสดงผล
                const embed = new EmbedBuilder()
                    .setDescription(`\`⏭️\`┃**Skipped** ไปยังเพลง **[${result.tracks[0].info.title}](${result.tracks[0].info.uri})** โดย: ${userMention}`)
                    .setColor(configjson.embed_color as HexColorString);

                return interaction.reply({ embeds: [embed] });
            }

        } catch (error) {
            console.error('Skipplay error:', error);
            
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` เกิดข้อผิดพลาดในการ skipplay`);

            if (interaction.deferred) {
                return interaction.editReply({ embeds: [embed] });
            } else {
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
        }
    }
}
