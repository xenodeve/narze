import { client } from "../..";
import { getBroadcast } from "../..";
import chalk from "chalk";
import { clearQueueCache, forceSave } from "../../functions/cache/queueCache";

client.manager.on("queueEnd" as any, (player) => {
    const isTerminalCommand = (player as any).get('isTerminalCommand') || false;
    const guild = client.guilds.cache.get(player.guild);
    
    console.log(`[${chalk.bold.cyanBright('QUEUE END')}] Queue ended in ${guild?.name}`);
    
    // Clear queue cache since queue is now empty
    clearQueueCache(player.guildId);
    forceSave();
    
    // Broadcast to SSE clients that queue is empty
    const broadcast = getBroadcast();
    const is247 = (player as any).get('twentyFourSeven') || false;
    
    if (broadcast) {
        console.log(`[${chalk.cyanBright('SSE')}] Broadcasting queueEnd event (24/7: ${is247})`);
        broadcast(player.guildId, 'queueEnd', {
            message: 'Queue is empty',
            twentyFourSeven: is247
        });
    }
    
    if (isTerminalCommand) {
        console.log(`[${chalk.bold.yellowBright('TERMINAL QUEUE')}] Queue ended in ${guild?.name}`);
    }
    
    if(!(player as any).get('twentyFourSeven')) {
        (player as any).set('isVolumeChangeCommand', false);
        player.destroy();
    } else {
        // 24/7 mode is on - keep player alive but clear the current track
        // This prevents stale track from showing on dashboard refresh
        (player as any).current = null;
        (player as any).playing = false;
        (player as any).paused = false;
        console.log(`[${chalk.bold.cyanBright('QUEUE END')}] 24/7 mode active, cleared current track but keeping player alive`);
    }
})