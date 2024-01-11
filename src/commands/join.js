const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../settings/config.json');
const { red } = require('color-name');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('เข้าห้อง'),
    async execute(interaction) {

        const { channel } = interaction.member.voice;

        let player = interaction.client.manager.get(interaction.guild.id) || interaction.client.manager.create({
            guild: interaction.guild.id,
            voiceChannel: interaction.member.voice.channel.id,
            textChannel: interaction.channel.id,
            selfDeafen: true,
        });

        global.join_statue = true;
        player.set('join', true)

        function TagChannel(channel) {
            channel_tag = channel.toString()
            return channel_tag
        }

        function player_new() {
            player = interaction.client.manager.create({
                guild: interaction.guild.id,
                voiceChannel: interaction.member.voice.channel.id,
                textChannel: interaction.channel.id,
                selfDeafen: true,
            });
        }

        if (!player.voiceChannel) {
            await player.destroy()
            await player_new()
        }

        await interaction.deferReply({ ephemeral: false });

        if (player.state == 'DISCONNECTED') {
            try {
                await player.connect();
            } catch (error) {
                const embed = new EmbedBuilder()
                    .setColor(red)
                    .setDescription(`> ❌บอทไม่มีอำนาจเข้าห้อง ${TagChannel(channel)}`);

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setColor(config.embed_color)
                .setDescription(`> \`🔊\` | เข้าห้อง ${TagChannel(channel)}`)

            return interaction.editReply({ embeds: [embed] });
        } else if (player.state == 'CONNECTED') {

            const embed = new EmbedBuilder()
                .setColor(red)
                .setDescription(`> \`🔊\` | เข้าห้อง ${TagChannel(channel)} อยู่แล้ว`)

            return interaction.editReply({ embeds: [embed] });
        }
    }
};