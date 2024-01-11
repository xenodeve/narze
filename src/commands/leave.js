const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../settings/config.json');
const { red } = require('color-name');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leave')
        .setDescription('ออกห้องเสียง'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        const { channel } = interaction.member.voice;

        const player = interaction.client.manager.get(interaction.guild.id) || interaction.client.manager.create({
            guild: interaction.guild.id,
            voiceChannel: interaction.member.voice.channel.id,
            textChannel: interaction.channel.id,
            selfDeafen: true,
        });

        if (!player) {
            const embed = new EmbedBuilder()
                .setColor(red)
                .setDescription(`> ❌ไม่มีบอทในห้อง`);

            return interaction.reply({ embeds: [embed], ephemeral: true });
        } else if (!interaction.member.voice.channel) {
            const embed = new EmbedBuilder()
                .setColor(red)
                .setDescription(`> ❌กรุณาเข้าห้องเสียงด้วย`);

            return interaction.reply({ embeds: [embed], ephemeral: true });
        } else if (interaction.member.voice.channel.id !== player.voiceChannel) {
            const embed = new EmbedBuilder()
                .setColor(red)
                .setDescription(`> ❌คุณต้องอยู่ในห้องเดียวกับบอท`);

            return interaction.reply({ embeds: [embed], ephemeral: true });
        } else {

            await player.destroy();

            function TagChannel(channel) {
                channel_tag = channel.toString()
                return channel_tag
            }

            const embed = new EmbedBuilder()
                .setColor(config.embed_color)
                .setDescription(`> \`🔊\` | ออกจากห้อง ${TagChannel(channel)}`)

            return interaction.editReply({ embeds: [embed] });
        }
    }
};