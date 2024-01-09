const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../settings/config.json');
const { red } = require('color-name');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('เข้าห้อง'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        const { channel } = interaction.member.voice;

        const player = interaction.client.manager.get(interaction.guild.id) || interaction.client.manager.create({
            guild: interaction.guild.id,
            voiceChannel: interaction.member.voice.channel.id,
            textChannel: interaction.channel.id,
            selfDeafen: true,
        });


        try {
            await player.connect();
        } catch (error) {
            const embed = new EmbedBuilder()
                .setColor(red)
                .setDescription(`> ❌บอทไม่มีอำนาจเปิดเพลงในห้อง ${TagChannel(channel)}`);

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        function TagChannel(channel) {
            channel_tag = channel.toString()
            return channel_tag
        }

        const embed = new EmbedBuilder()
            .setColor(config.embed_color)
            .setDescription(`> \`🔊\` | เข้าห้อง ${TagChannel(channel)}`)

        return interaction.editReply({ embeds: [embed] });

    }
};