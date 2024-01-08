const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { red } = require('color-name');
const { convertTime } = require('../structures/convertTime.js')
const config = require('../settings/config.json')

module.exports = {
    data: new SlashCommandBuilder()
        .setName('seek')
        .setDescription('Seek')
        .addStringOption(option =>
            option
                .setName('time')
                .setDescription('หน่วยเป็นวินาที')
                .setRequired(true)
        ),
    async execute(interaction) {
        const time = interaction.options.getString('time');
        if (!time) {const embed = new EmbedBuilder()
            .setColor(red)
            .setDescription(`> ❌กรุณาระบุเวลา`);

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
        const player = interaction.client.manager.get(interaction?.guild?.id);

        
        if (!player) {
            const embed = new EmbedBuilder()
                .setColor(red)
                .setDescription(`> ❌ไม่มีเครื่องเล่น`);

            return interaction.reply({ embeds: [embed], ephemeral: true });
        } else if (!player.playing) {
            const embed = new EmbedBuilder()
                .setColor(red)
                .setDescription(`> ❌ไม่มีการเล่นเพลงอยู่`);

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

        player.seek(parseInt(time) * 1000);

        const embed = new EmbedBuilder()
                .setColor(config.embed_color)
                .setDescription(`> ⏭️┃ข้ามไป: \` ${convertTime(time * 1000)} \``);

            return interaction.reply({ embeds: [embed], ephemeral: false });
    },
};