import chalk from "chalk";
import { client } from "../..";

client.manager.on("trackEnd" as any, (player, track, payload) => {
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