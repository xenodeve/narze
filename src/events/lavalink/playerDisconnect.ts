import chalk from "chalk";
import { client } from "../..";

client.manager.on("playerDisconnect" as any, (player) => {
    const guild = client.guilds.cache.get(player.guildId);
    if (!guild) return;
    
    const isTerminalCommand = (player as any).get('isTerminalCommand') || false;
    
    if (isTerminalCommand) {
        console.log(`[${chalk.bold.greenBright('TERMINAL NODE')}] Player destroyed ${chalk.greenBright('in')} ${guild.name}${chalk.greenBright('(')}${player.guildId}${chalk.greenBright(')')}`);
        // Reset terminal flag เมื่อ player ถูกทำลาย
        (player as any).set('isTerminalCommand', false);
    } else {
        console.log(`[${chalk.bold.greenBright('NODE')}] Player destroyed ${chalk.greenBright('in')} ${guild.name}${chalk.greenBright('(')}${player.guildId}${chalk.greenBright(')')}`);
    }
})