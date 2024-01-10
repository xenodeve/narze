const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../settings/config.json');
const { red } = require('color-name');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('วนซ้ำ')
        .addStringOption(option =>
            option
                .setName('mode')
                .setDescription('โหมดการวนซ้ำ')
                .addChoices(
                    { name: '🚫 ปิด', value: 'off' },
                    { name: '🔂 เพลงปัจจุบัน', value: 'current' },
                    { name: '🔁 ทั้งคิว', value: 'queue' },
                ),
        ),
    async execute(interaction) {
        const player = global.player;

        if (!player) {
            const embed = new EmbedBuilder()
                .setColor(red)
                .setDescription(`> ❌ไม่มีเครื่องเล่น`);

            return interaction.reply({ embeds: [embed], ephemeral: true });
        } else if (!player.queue) {
            const embed = new EmbedBuilder()
                .setColor(red)
                .setDescription(`> ❌ไม่มีเพลงที่เล่นอยู่`);

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: false });

        const choice = interaction.options.getString('mode');

        if (choice === "current") {
            if (player.trackRepeat === false) {
                await player.setTrackRepeat(true);

                const embed = new EmbedBuilder()
                    .setDescription(`> \`🔂\` | ลูปเพลง: \`ปัจจุบัน\``)
                    .setColor(config.embed_color)

                return interaction.editReply({ embeds: [embed] });
            } else {
                await player.setTrackRepeat(false);

                const embed = new EmbedBuilder()
                    .setDescription(`> \`🚫\` | ลูปเพลง: \`ปิด\``)
                    .setColor(config.embed_color)

                return interaction.editReply({ embeds: [embed] });
            }
        } else if (choice === "queue") {
            if (player.queueRepeat === true) {
                await player.setQueueRepeat(false);

                const embed = new EmbedBuilder()
                    .setDescription(`> \`🚫\` | ลูปเพลง: \`ปิด\``)
                    .setColor(config.embed_color)

                return interaction.editReply({ embeds: [embed] });
            } else {
                await player.setQueueRepeat(true);

                const embed = new EmbedBuilder()
                    .setDescription(`> \`🔁\` | ลูปเพลง: \`คิวทั้งหมด\``)
                    .setColor(config.embed_color)

                return interaction.editReply({ embeds: [embed] });
            }
        } else if (choice === 'off') {
            if (player.queueRepeat === true || player.trackRepeat === true) {
                await player.setQueueRepeat(false);
                player.setTrackRepeat(false);

                const embed = new EmbedBuilder()
                    .setDescription(`> \`🚫\` | ลูปเพลง: \`ปิด\``)
                    .setColor(config.embed_color)

                return interaction.editReply({ embeds: [embed] });
            }
        }
    }
}
