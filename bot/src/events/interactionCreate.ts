import { client } from "..";
import { EmbedBuilder, HexColorString, MessageFlags } from "discord.js";
import chalk from 'chalk';
import configjson from "../config/config.json";
import { config } from "dotenv";

config(); //เรียกใช้ dotenv

client.on("interactionCreate", async (interaction) => {
    if(interaction.guild) {
        // Handle Autocomplete Interactions
        if(interaction.isAutocomplete()) {
            const command = client.commands.get(interaction.commandName);
            if(!command || !command.autocomplete) return;

            try {
                await command.autocomplete(client, interaction);
            } catch (error) {
                console.error('Autocomplete error:', error);
            }
            return;
        }

        // Handle Command Interactions
        if(interaction.isCommand() || interaction.isContextMenuCommand()) {
            const command = client.commands.get(interaction.commandName);
            if(!command) return;

            try{
                await command.run(client, interaction);

                // Random dashboard promo (30% chance) for lavalink commands
                const lavalinkCommands = ['play', 'skip', 'pause', 'volume', 'loop', 'clear', 'seek', '247', 'queue', 'leave'];
                if (lavalinkCommands.includes(interaction.commandName) && Math.random() < 0.3) {
                    const promoEmbed = new EmbedBuilder()
                        .setColor(configjson.embed_color as HexColorString)
                        .setDescription(`-# สามารถควบคุมจาก [Dashboard](https://dashboard.narze.space/) ได้แล้ว ง่ายกว่าใช้คำสั่งเยอะ ลองใช้เลย! \n - https://dashboard.narze.space/`);
                    await interaction.channel?.send({ embeds: [promoEmbed] }).catch(() => {});
                }
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: "There was an error while executing this command!", flags: MessageFlags.Ephemeral });
            }

            const TextChannel = interaction.guild.channels.cache.get(interaction.channelId);
            const userAvatar = interaction.user.displayAvatarURL();
            const logGuild = interaction.client.guilds.cache.get(process.env.LOG_GUILD_ID);
            const logChannel = logGuild.channels.cache.get(process.env.LOG_CHANNEL_ID);
            const voiceMember = interaction.member && 'voice' in interaction.member ? interaction.member.voice : null;

            // console.log(voiceMember)

            const embed = new EmbedBuilder()
                .setColor((configjson.embed_color) as HexColorString)
                .setAuthor({
                    name: "View User",
                    iconURL: userAvatar,
                    url: `https://discord.com/users/${interaction.user.id}`,
})
                .setDescription(`User: \`${interaction.user.tag}\`(\`${interaction.user.id}\`) \nUserChannel: \`${voiceMember?.channel?.name || 'Not in voice'}\`(\`${voiceMember?.channel?.id || 'N/A'}\`) \nCommand: \`${interaction.commandName}\`(\`${interaction.commandId}\`) \nChannel: \`${TextChannel.name}\`(\`${TextChannel.id}\`) \nServer: \`${interaction.guild.name}\`(\`${interaction.guild.id}\`)`)
                .setThumbnail(interaction.guild.iconURL())
                .setTimestamp();

            if (logChannel?.isTextBased()) {
                logChannel.send({ embeds: [embed] });
            }


            console.log(`[${chalk.bold.greenBright('COMMAND')}] ${interaction.user.tag} ${chalk.greenBright('Used')} ${interaction.commandName} ${chalk.greenBright('in')} ${interaction.guild.name}${chalk.greenBright('(')}${interaction.guild.id}${chalk.greenBright(')')}`);
        }
    }
});