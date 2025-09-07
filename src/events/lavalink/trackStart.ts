import chalk from "chalk";
import { client } from "../..";
import { EmbedBuilder, HexColorString } from "discord.js";
import configjson from '../../config/config.json';
import { convertTime } from "../../functions/convertTime/convertTime";
import { formatPlaylistInfo, isFromPlaylist, createPlaylistEmbedField, getPlaylistThumbnail, getPlaylistUrl } from "../../functions/lavalink/playlistMetadata";
import { getIconURL } from "../../functions/lavalink/iconConfig";

client.manager.on("trackStart" as any, async (player, track) => {
    const channel = client.channels.cache.get(player.textChannel);
    const guild = client.guilds.cache.get(player.guildId);

    // console.log(track)

    // เช็ค flag ว่าเป็นเพลงแรกจากคำสั่ง play หรือไม่
    const isFirstFromCommand = (player as any).get('isFirstFromCommand') || false;
    const isSkipplay = (player as any).get('isSkipplay') || false;
    const isTerminalCommand = (player as any).get('isTerminalCommand') || false;

    const isOffLoop = (player as any).get('offLoop') || false;
    const isQueueLoop = (player as any).get('queueLoop') || false;
    const isCurrentLoop = (player as any).get('currentLoop') || false;

    const isSkip = (player as any).get('isSkip') || false;

    // console.log('isFirstFromCommand:', isFirstFromCommand);
    
    // เพลงแรกจริงๆ = มี flag และ queue ว่าง
    const isActualFirstTrack = isFirstFromCommand && player.queue.size === 0;
    
    // console.log('isActualFirstTrack:', isActualFirstTrack);

    if ((!isActualFirstTrack && !isSkipplay && !isCurrentLoop) || (isSkip && !isActualFirstTrack && !isSkipplay)) {
        // ถ้าเป็นคำสั่งจาก terminal ให้ไม่ส่ง embed
        if (isTerminalCommand) {
            console.log(`[${chalk.bold.greenBright('TERMINAL TRACK')}] Now playing: ${track.info.title} ${chalk.greenBright('in')} ${guild?.name}${chalk.greenBright('(')}${player.guildId}${chalk.greenBright(')')}`);
            return;
        }

        // ใช้ channel จาก player แทน interaction เพื่อป้องกัน bug ใน multi-guild
        if (channel && 'send' in channel) { 
            // เช็คและแปลง thumbnail URL จาก mqdefault เป็น maxresdefault
            let thumbnailUrl = track.info.thumbnail;
            if (thumbnailUrl && thumbnailUrl.includes('mqdefault')) {
                thumbnailUrl = thumbnailUrl.replace('mqdefault', 'maxresdefault');
            }
 
            // ใช้ avatar จาก requester หาก track มี requester หรือใช้ default
            let userAvatar = client.user?.displayAvatarURL();
            if (track.requester) {
                try {
                    // ลองดึง user จาก client
                    const user = await client.users.fetch(track.requester as string);
                    if (user) {
                        userAvatar = user.displayAvatarURL();
                    }
                } catch (error) {
                    // หาก fetch ไม่ได้ ลองใช้จาก track.requester โดยตรง
                    if (typeof track.requester === 'object' && 'displayAvatarURL' in track.requester) {
                        userAvatar = (track.requester as any).displayAvatarURL();
                    }
                }
            }
            
            // สร้าง description พื้นฐาน
            let description = `\`▶️\`┃**${track.info.title}** \` ${convertTime(track.info.length)} \``;
            
            // เพิ่มข้อมูล playlist หากมี
            if (isFromPlaylist(track)) {
                const playlistInfo = formatPlaylistInfo(track, 'index-only');
                description += `\n> ${formatPlaylistInfo(track, 'short')} ${playlistInfo}`;
            }
            
            // ใช้ระบบ iconConfig เพื่อกำหนด iconURL
            const iconURL = await getIconURL(track, userAvatar);
            let authorURL = track.info.uri; // Default URL เป็น track URL
            
            // เช็คการตั้งค่าว่าจะใช้ playlist URL หรือไม่
            if (configjson.author_url_config.use_playlist_url && isFromPlaylist(track)) {
                const playlistUrl = getPlaylistUrl(track);
                if (playlistUrl) {
                    authorURL = playlistUrl;
                }
            }
            
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_color as HexColorString)
                .setAuthor({ name: 'Go to Page', iconURL: iconURL, url: authorURL })
                .setDescription(description)
                .setThumbnail(thumbnailUrl);
                
            // เพิ่ม field สำหรับ playlist ถ้าต้องการ (optional)
            // const playlistField = createPlaylistEmbedField(track);
            // if (playlistField) {
            //     embed.addFields(playlistField);
            // }
            
            return (channel as any).send({ embeds: [embed] });
        }
    }
    
    // console.log(`[${chalk.bold.yellowBright('TRACK')}] ${track.title} ${chalk.yellowBright('started playing in')} ${player.guild}`);
})