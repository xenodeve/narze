const { EmbedBuilder } = require('discord.js');
const config = require('../../settings/config.json');
const { convertTime } = require('../../structures/convertTime.js');

module.exports = {
	name: 'trackStart',
	async execute(interaction, track) {
		// await interaction.deferReply({ ephemeral: false});
		console.log(`[LAVALINK] : Track Start`);

		// const embed = new EmbedBuilder()
		// 	.setColor(config.embed_color)
		// 	.setTitle('เพลงถัดไปกำลังเริ่มเล่น')
		// 	.setDescription(`▶️ **${track.title}**`)
		// 	.setThumbnail(`https://img.youtube.com/vi/${track.identifier}/maxresdefault.jpg`);

		// return interaction.editReply({ embeds: [embed] });
	},
};