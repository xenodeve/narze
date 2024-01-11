const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../settings/config.json');
const { red } = require('color-name');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('247')
        .setDescription('24/7'),
    async execute(interaction) {
        const player = interaction.client.manager.get(interaction.guild.id)

        if (!player) {
            const embed = new EmbedBuilder()
                .setDescription(`> ❌ไม่มีบอทในห้อง`)
                .setColor(red);

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