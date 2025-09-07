import { ApplicationCommandType, CommandInteraction, EmbedBuilder, HexColorString } from "discord.js";
import { clientBot } from "../interfaces/client";
import configjson from "../config/config.json";

export default {
    name: "ping",
    description: "Ping command",
    type: ApplicationCommandType.ChatInput,
    run: async (client: clientBot, interaction: CommandInteraction) => {
        await interaction.deferReply();

        const reply = await interaction.fetchReply();
        const ping = reply.createdTimestamp - interaction.createdTimestamp;

		const embed = new EmbedBuilder()
        .setColor(configjson.embed_color as HexColorString)
        .setTitle(`🏓 |  Ping Status`)
        .setThumbnail('https://i.gifer.com/fyMe.gif')
        .addFields(
            { name: 'Reply Latency', value: `${ping}ms`, inline: true },
            { name: 'Bot Latency', value: `${Math.abs(Date.now() - interaction.createdTimestamp)}ms`, inline: true },
            { name: 'API Latency', value: `${Math.abs(Math.round(interaction.client.ws.ping))}ms`, inline: true },
        )
        
        return interaction.editReply({ embeds: [embed] });
    }
};