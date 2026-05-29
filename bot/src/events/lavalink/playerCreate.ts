import chalk from "chalk";
import { client } from "../..";

client.manager.on("playerCreate" as any, (player) => {
	const guild = client.guilds.cache.get(player.guildId);
    
    console.log(`[${chalk.bold.greenBright('NODE')}] ${chalk.greenBright('player create from')} ${chalk.greenBright('Server:')} ${guild.name}${chalk.greenBright('(')}${player.guildId}${chalk.greenBright(')')}`);
})