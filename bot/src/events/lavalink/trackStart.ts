import chalk from "chalk";
import { client } from "../..";
import { EmbedBuilder, HexColorString } from "discord.js";
import configjson from '../../config/config.json';
import { convertTime } from "../../functions/convertTime/convertTime";
import { formatPlaylistInfo, isFromPlaylist, createPlaylistEmbedField, getPlaylistThumbnail, getPlaylistUrl } from "../../functions/lavalink/playlistMetadata";
import { getIconURL } from "../../functions/lavalink/iconConfig";
import { validateAndConvertThumbnail } from "../../functions/lavalink/thumbnailValidator";
import { getBroadcast } from "../..";
import { incrementQueueRevision } from "../../api/utils/sse";
import { toRequesterInfo } from "../../api/utils/metadataAdapter";
import { formatQueueForSSE } from "../../api/utils/queueCoordinator";
import { recordTrackPlay } from "../../functions/history/playHistory";

// Max track age before re-resolve (4 hours = 14400000ms)
const MAX_TRACK_AGE_MS = 4 * 60 * 60 * 1000;

client.manager.on("trackStart" as any, async (player, track) => {
    console.log(chalk.bold.cyan(`[trackStart] Firing for guild ${player.guildId}, track: ${track.info.title}`));
    
    // Check if track URL might be expired and needs re-resolve
    const trackAddedAt = (track as any).info?.addedAt;
    if (trackAddedAt && Date.now() - trackAddedAt > MAX_TRACK_AGE_MS) {
        const hoursOld = ((Date.now() - trackAddedAt) / (60 * 60 * 1000)).toFixed(1);
        console.log(chalk.yellow(`[trackStart] ⚠️ Track "${track.info.title}" is ${hoursOld}h old, attempting re-resolve...`));
        
        try {
            // Re-resolve using the track URI or search query
            const searchQuery = track.info.uri || track.info.title;
            const result = await client.manager.resolve({
                query: searchQuery,
                requester: track.info.requester
            });
            
            if (result && result.tracks && result.tracks.length > 0) {
                const freshTrack = result.tracks[0];
                // Update track info with fresh URL while keeping original metadata
                track.track = freshTrack.track; // The encoded track data
                track.info.uri = freshTrack.info.uri;
                track.info.addedAt = Date.now(); // Reset the timestamp
                console.log(chalk.green(`[trackStart] ✅ Successfully re-resolved track "${track.info.title}"`));
            } else {
                console.log(chalk.red(`[trackStart] ❌ Failed to re-resolve track "${track.info.title}" - no results`));
            }
        } catch (err) {
            console.error(chalk.red(`[trackStart] ❌ Error re-resolving track:`), err);
        }
    }
    
    console.log(chalk.cyan(`[trackStart] Thumbnail: ${track.info.thumbnail}`));
    
    // Broadcast to SSE clients (Server-Sent Events)
    const broadcast = getBroadcast();
    console.log(chalk.cyan(`[trackStart] Broadcast function available: ${!!broadcast}`));
    if (broadcast) {
        const requesterInfo = toRequesterInfo(track.info.requester);
        broadcast(player.guildId, 'trackStart', {
            track: {
                title: track.info.title,
                author: track.info.author,
                duration: track.info.length,
                thumbnail: track.info.thumbnail,
                uri: track.info.uri,
                requester: track.info.requester,
                requesterAvatar: requesterInfo?.avatar ?? undefined,
                requesterName: requesterInfo?.username ?? undefined,
            },
            position: 0,
            paused: false,
            volume: player.volume,
            playing: true,
            queueLength: player.queue?.length || 0
        });

        // Broadcast queueUpdate so QueueSection shifts the display when any track starts
        incrementQueueRevision(player.guildId);
        broadcast(player.guildId, 'queueUpdate', { queue: formatQueueForSSE(player.queue) });
        console.log(chalk.green(`[trackStart] SSE broadcast sent for guild ${player.guildId}`));
    }
    
    // Record play history if track has a requester
    if (track.info.requester) {
        const requesterInfoForHistory = toRequesterInfo(track.info.requester);
        const requesterId = requesterInfoForHistory?.id ?? (
            typeof track.info.requester === 'string' ? track.info.requester : undefined
        );
        
        if (requesterId) {
            recordTrackPlay(player.guildId, requesterId, {
                title: track.info.title,
                author: track.info.author,
                uri: track.info.uri,
                thumbnail: track.info.thumbnail,
                length: track.info.length,
                requester: requesterId,
            });
        }
    }

    // Update Listening Session (New System)
    try {
        const voiceChannelId = player.voiceChannel;
        const sessionGuild = client.guilds.cache.get(player.guildId);
        if (voiceChannelId) {
            const voiceChannel = client.channels.cache.get(voiceChannelId);
            if (voiceChannel && voiceChannel.isVoiceBased()) {
                const members = voiceChannel.members;
                const sessionRequester = toRequesterInfo(track.info.requester);
                import("../../functions/history/ListeningSessionManager").then(({ updateSession }) => {
                    updateSession(
                        player.guildId,
                        voiceChannelId,
                        {
                            title: track.info.title,
                            author: track.info.author,
                            uri: track.info.uri,
                            thumbnail: track.info.thumbnail,
                            duration: track.info.length,
                            requesterAvatar: sessionRequester?.avatar ?? undefined,
                            requesterName: sessionRequester?.username ?? undefined,
                            requesterId: sessionRequester?.id ?? undefined,
                        },
                        members,
                        sessionGuild?.name
                    );
                });
            }
        }
    } catch (err) {
        console.error("Failed to update listening session:", err);
    }
    
    // Update Queue Cache (Backup)
    try {
        const { updateQueueCache } = await import("../../functions/cache/queueCache");
        const cacheRequester = toRequesterInfo(track.info.requester);
        updateQueueCache(player.guildId, {
            guildName: client.guilds.cache.get(player.guildId)?.name,
            voiceChannelId: player.voiceChannel,
            textChannelId: player.textChannel,
            currentTrack: {
                title: track.info.title,
                author: track.info.author,
                uri: track.info.uri,
                thumbnail: track.info.thumbnail,
                duration: track.info.length,
                requester: cacheRequester?.id,
                requesterName: cacheRequester?.username,
                requesterAvatar: cacheRequester?.avatar ?? undefined,
            },
            queue: formatQueueForSSE(player.queue || []),
            volume: player.volume,
            paused: player.paused,
            twentyFourSeven: (player as any).get('twentyFourSeven') || false,
        });
    } catch (err) {
        console.error("Failed to update queue cache:", err);
    }
    
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
    const dontShow = (player as any).get('dontShow') || false;

    // console.log('isFirstFromCommand:', isFirstFromCommand);
    
    // เพลงแรกจริงๆ = มี flag และ queue ว่าง
    const isActualFirstTrack = isFirstFromCommand && player.queue.size === 0;
    
    // console.log('isActualFirstTrack:', isActualFirstTrack);

    if (((!isActualFirstTrack && !isSkipplay && !isCurrentLoop) || (isSkip && !isActualFirstTrack && !isSkipplay)) && !dontShow) {
        // ถ้าเป็นคำสั่งจาก terminal ให้ไม่ส่ง embed
        if (isTerminalCommand) {
            console.log(`[${chalk.bold.greenBright('TERMINAL TRACK')}] Now playing: ${track.info.title} ${chalk.greenBright('in')} ${guild?.name}${chalk.greenBright('(')}${player.guildId}${chalk.greenBright(')')}`);
            return;
        }

        // ใช้ channel จาก player แทน interaction เพื่อป้องกัน bug ใน multi-guild
        if (channel && 'send' in channel) { 
            // เช็คและแปลง thumbnail URL โดยใช้ utility function
            const thumbnailUrl = await validateAndConvertThumbnail(track.info.thumbnail);
 
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
            
            // Add requester mention to description if available
            const requesterId = track.info.requester?.user?.id || track.info.requester?.id || null;
            if (requesterId) {
                description += `\n> Requested by <@${requesterId}>`;
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
            
            return (channel as any).send({ embeds: [embed] });
        }
    }
    
    // console.log(`[${chalk.bold.yellowBright('TRACK')}] ${track.title} ${chalk.yellowBright('started playing in')} ${player.guild}`);
})