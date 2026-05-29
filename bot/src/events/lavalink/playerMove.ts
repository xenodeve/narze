import { client } from "../..";
import chalk from "chalk";

client.manager.on("playerMove" as any, (player, oldChannel, newChannel) => {
    let interaction = null;
    
    // หา interaction จาก client.interactions collection
    for (const [key, value] of client.interactions) {
        // console.log("Key:", key);
        // console.log("Interaction:", value.interaction);
        // console.log("Interaction ID:", value.interaction.id);
        // console.log("User:", value.interaction.user.tag);
        // console.log("Guild:", value.interaction.guild.name);
        // console.log("Command:", value.command);
        // console.log("Query:", value.query);
        
        // ตรวจสอบว่า guild ID ตรงกันหรือไม่
        if (value.guild?.id === player.guild) {
            interaction = value.interaction;
            console.log("✅ Found matching interaction for guild:", value.interaction.guild.name);
            break; // หยุด loop เมื่อเจอแล้ว
        }

        if (value.interaction) {
            const new_Channel = value.interaction.guild.channels.cache.get(oldChannel);
            const old_Channel = value.interaction.guild.channels.cache.get(player);
            console.log(`[${chalk.bold.greenBright('LAVALINK')}] ${chalk.greenBright('player moved from')} ${old_Channel?.name || 'Unknown'} ${chalk.greenBright('to')} ${chalk.greenBright('New Channel:')} ${new_Channel?.name || 'Unknown'} ${chalk.greenBright('Server:')} ${value.interaction.guild.name || 'Unknown'}${chalk.greenBright('(')}${value.interaction.guild.id}${chalk.greenBright(')')}`);
        } else {
            console.log(`[${chalk.bold.greenBright('LAVALINK')}] ${chalk.greenBright('player moved but no interaction found')} ${chalk.greenBright('Server:')} ${player.guild}`);
        }
    }
})