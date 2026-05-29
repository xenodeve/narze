import { client } from "../..";
import { getBroadcast } from "../..";
import chalk from "chalk";

client.manager.on("playerDestroy" as any, (player) => {
    const guild = client.guilds.cache.get(player.guildId);
    
    console.log(`[${chalk.bold.redBright('PLAYER DESTROY')}] Player destroyed in ${guild?.name || player.guildId}`);
    
    // Broadcast to SSE clients that player is destroyed
    const broadcast = getBroadcast();
    if (broadcast) {
        console.log(`[${chalk.redBright('SSE')}] Broadcasting playerDestroy event`);
        broadcast(player.guildId, 'playerDestroy', {
            message: 'Player destroyed',
            guildId: player.guildId
        });
    }
});
