import chalk from "chalk";
import { client } from "../..";
import { getBroadcast } from "../..";

client.manager.on("trackEnd" as any, async (player, track, payload) => {
    console.log(`[${chalk.bold.yellowBright('TRACK END')}] ${track.info.title} ended in ${client.guilds.cache.get(player.guildId)?.name}`);
    
    // Broadcast to SSE clients (Server-Sent Events)
    const broadcast = getBroadcast();
    if (broadcast) {
        console.log(`[${chalk.yellowBright('SSE')}] Broadcasting trackEnd event for ${track.info.title}`);
        broadcast(player.guildId, 'trackEnd', {
            track: {
                title: track.info.title,
                author: track.info.author,
                duration: track.info.length,
                thumbnail: track.info.thumbnail,
                uri: track.info.uri,
                requester: track.info.requester
            },
            position: track.info.length, // Track is complete
            playing: false,
            queueLength: player.queue?.length || 0,
            queue: player.queue?.map((t: any) => ({
                title: t.info?.title || 'Unknown',
                author: t.info?.author || 'Unknown Artist',
                duration: t.info?.length || 0,
            })) || []
        });
    } else {
        console.log(`[${chalk.redBright('ERROR')}] Broadcast function not available`);
    }
    if (!player) return;

    const guild = client.guilds.cache.get(player.guildId);
    const member = guild.members.cache.get(payload.userId);
    const isTerminalCommand = (player as any).get('isTerminalCommand') || false;
    
    if (isTerminalCommand) {
        console.log(`[${chalk.bold.yellowBright('TERMINAL TRACK')}] ${track.info.title} ${chalk.yellowBright('finished in')} ${guild?.name}${chalk.yellowBright('(')}${player.guildId}${chalk.yellowBright(')')}`);
    } else {
        console.log(`[${chalk.bold.yellowBright('DEBUG')}] ${track.info.title} ${chalk.yellowBright('จบการเล่นใน')} ${guild?.name}${chalk.yellowBright('(')}${player.guildId}${chalk.yellowBright(')')}`);
    }

    (player as any).set('isFirstFromCommand', false);
    (player as any).set('isSkipplay', false);
    (player as any).set('isSkip', false);
    (player as any).set('dontShow', false);
    // ไม่ reset isTerminalCommand ที่นี่ เพราะยังใช้ต่อใน session เดียวกัน
})