const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../settings/config.json');
const { red } = require('color-name');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('ปรับความดัง')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('ความดัง (%)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(1000)
        ),
    async execute(interaction) {

        const player = global.player;

        if (!player) {
            const embed = new EmbedBuilder()
            .setColor(red)
            .setDescription(`> ❌ไม่มีเครื่องเล่น`);

        return interaction.reply({ embeds: [embed], ephemeral: true});
        } else if (!player.playing) {
            const embed = new EmbedBuilder()
            .setColor(red)
            .setDescription(`> ❌ไม่มีเพลงที่เล่นอยู่`);

        return interaction.reply({ embeds: [embed], ephemeral: true});
        }

        await interaction.deferReply({ ephemeral: false });

        const value = interaction.options.getInteger('amount');
        if (!value) {
            const embed = new EmbedBuilder()
                .setColor(config.embed_color)
                .setDescription(`> \`📢\`┃**เสียง:** \`${config.volume_default}%\``);

            return interaction.editReply({ embeds: [embed], ephemeral: false });
        }


        await player.setVolume(value);

        const embed = new EmbedBuilder()
            .setColor(config.embed_color)
            .setDescription(`> \`📢\`┃**เสียง:** \`${value}%\``);

        return interaction.editReply({ embeds: [embed], ephemeral: false });
    }
}