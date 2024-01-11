const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../settings/config.json');
const { red } = require('color-name');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leave')
        .setDescription('ออกห้องเสียง'),
    async execute(interaction) {

        const { channel } = interaction.member.voice;

        const player = interaction.client.manager.get(interaction.guild.id)

        function TagChannel(channel) {
            channel_tag = channel.toString()
            return channel_tag
        }

        console.log(player)
        if (!player || typeof player === 'undefined') {
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
        }
        
        if (player) {
            await player.destroy();

            const embed = new EmbedBuilder()
                .setColor(config.embed_color)
                .setDescription(`> \`🔊\` | ออกจากห้อง ${TagChannel(channel)}`)

            return interaction.reply({ embeds: [embed] });
        }

    }
};