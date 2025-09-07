import { client } from "../..";
import chalk from "chalk";

client.manager.on("queueEnd" as any, (player) => {
    const isTerminalCommand = (player as any).get('isTerminalCommand') || false;
    const guild = client.guilds.cache.get(player.guild);
    
    if (isTerminalCommand) {
        console.log(`[${chalk.bold.yellowBright('TERMINAL QUEUE')}] Queue ended in ${guild?.name}`);
    }
    
    if(!(player as any).get('twentyFourSeven')) {
        player.destroy();
    }
})