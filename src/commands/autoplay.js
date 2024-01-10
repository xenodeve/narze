const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../settings/config.json');
const { red } = require('color-name');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('autoplay')
        .setDescription('เพิ่มคิวอัตโนมัติ'),
    async execute(interaction) {

        const player = global.player;

        if (!player || !player.playing) {
            const embed = new EmbedBuilder()
                .setDescription(`> ❌ไม่มีเพลงที่กำลังเล่น`)
                .setColor(red);

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: false });

        const autoplay = player.get('autoplay');
        if (autoplay === true) {
            await player.set('autoplay', false);

            const embed = new EmbedBuilder()
                .setDescription(`> \`📻\` | *เล่นอัตโนมัติ ได้ถูก:* \` ปิดการใช้งาน \``)
                .setColor(config.embed_color);

            return interaction.editReply({ embeds: [embed] });
        } else {

            if (player.queue.size === 0) {
                const identifier = player.queue.current.identifier;
                const search = `https://www.youtube.com/watch?v=${identifier}&list=RD${identifier}`;
                const res = await player.search(search, interaction.user);

                try {
                    await player.queue.add(res.tracks[1]);
                } catch (e) {
                    await player.set('autoplay', false)
                    const embed = new EmbedBuilder()
                        .setDescription(`> ❌Autoplay Support Youtubeเท่านั้น`)
                        .setColor(red);

                    return interaction.editReply({ embeds: [embed], ephemeral: true });
                }
            }

            await player.set('autoplay', true);
            await player.set('requester', interaction.user);

            const embed = new EmbedBuilder()
                .setDescription(`> \`📻\` | *เล่นอัตโนมัติ ได้ถูก:* \` เปิดการใช้งาน \``)
                .setColor(config.embed_color)

            return interaction.editReply({ embeds: [embed] });

        }
    }
}