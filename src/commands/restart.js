const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { red } = require('color-name');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('restart')
        .setDescription('restart บอท | Fix เสียงไม่ออก'),

    async execute(interaction) {

        function player_new() {
            player = interaction.client.manager.create({
                guild: interaction.guild.id,
                voiceChannel: interaction.member.voice.channel.id,
                textChannel: interaction.channel.id,
                selfDeafen: true,
            });
        }

        let player = interaction.client.manager.get(interaction.guild.id)
        
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

        await player.destroy();
        await global.player.destroy();
        // await player_new();

        const embed = new EmbedBuilder()
            .setColor('#32CD32')
            .setDescription(`> \`⟳\` | Restart สำเร็จ`)

        return interaction.reply({ embeds: [embed], ephemeral: true });

    }
}