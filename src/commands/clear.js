const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../settings/config.json');
const { red } = require('color-name');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('เคลียร์คิว'),
    async execute(interaction) {
        const player = interaction.client.manager.get(interaction.guild.id)

        if (!player) {
            const embed = new EmbedBuilder()
                .setColor(red)
                .setDescription(`> ❌ไม่มีบอทในห้อง`);

            return interaction.reply({ embeds: [embed], ephemeral: true });
        } else if (!player.queue) {
            const embed = new EmbedBuilder()
                .setColor(red)
                .setDescription(`> ❌ไม่มีเพลงในคิว`);

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

        await interaction.deferReply({ ephemeral: false });

        if (player || player.queue) {
            await player.queue.clear();

            const embed = new EmbedBuilder()
                .setColor(config.embed_color)
                .setDescription(`> \`🧹\` | เคลียร์คิวแล้ว`)

            return interaction.editReply({ embeds: [embed] });
        }
    }
};