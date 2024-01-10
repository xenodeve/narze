const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../settings/config.json');
const { red } = require('color-name');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('247')
		.setDescription('24/7'),
	async execute(interaction) {
        const player = global.player;

        if(!player) {
            const embed = new EmbedBuilder()
                .setDescription(`> ❌ไม่มีเพลงที่เล่นอยู่`)
                .setColor(red);

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: false });

        if (player.twentyFourSeven) {

            player.twentyFourSeven = false;
            const embed = new EmbedBuilder()
                .setDescription(`> \`🌙\` | *โหมด 24/7 :* \` ปิดการใช้งาน \``)
                .setColor(config.embed_color);

            return interaction.editReply({ embeds: [embed] });
        } else {
            player.twentyFourSeven = true;

            const embed = new EmbedBuilder()
                .setDescription(`> \`🌕\` | *โหมด 24/7 :* \` เปิดการใช้งาน \``)
                .setColor(config.embed_color);

            return interaction.editReply({ embeds: [embed] });
        }
	}
};