const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../settings/config.json');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('ping')
		.setDescription('Ping Status!'),
	async execute(interaction) {
        // await interaction.deferReply({ ephemeral: false});

        const reply = await interaction.fetchReply();
        const ping = reply.createdTimestamp - interaction.createdTimestamp;

		const embed = new EmbedBuilder()
        .setColor(config.embed_color)
        .setTitle(`🏓 |  Ping Status`)
        .setThumbnail('https://i.gifer.com/fyMe.gif')
        .addFields(
            { name: 'Reply Latency', value: `${ping}ms`, inline: true },
            { name: 'Bot Latency', value: `${Math.abs(Date.now() - interaction.createdTimestamp)}ms`, inline: true },
            { name: 'API Latency', value: `${Math.abs(Math.round(interaction.client.ws.ping))}ms`, inline: true },
        )
        
        // return interaction.editReply({ embeds: [embed] });
        return interaction.reply({ embeds: [embed] });
	},
};