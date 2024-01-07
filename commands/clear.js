const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../settings/config.json');
const { red } = require('color-name');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('เคลียร์คิว'),
    async execute(interaction) {
        const player = global.player;

        if (!player) {
            const embed = new EmbedBuilder()
            .setColor(red)
            .setDescription(`> ❌ไม่มีเครื่องเล่น`);

        return interaction.reply({ embeds: [embed], ephemeral: true});
        } else if (!player.queue) {
            const embed = new EmbedBuilder()
            .setColor(red)
            .setDescription(`> ❌ไม่มีเพลงในคิว`);

        return interaction.reply({ embeds: [embed], ephemeral: true});
        }

        await interaction.deferReply({ ephemeral: false });

        if (player || player.queue){
            await player.queue.clear();

            const embed = new EmbedBuilder()
                .setColor(config.embed_color)
                .setDescription(`> \`🧹\` | เคลียร์คิวแล้ว`)

            return interaction.editReply({ embeds: [embed] });
        }
    }
};