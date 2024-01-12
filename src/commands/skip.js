const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const config = require('../settings/config.json');
const { red } = require('color-name');
const { convertTime } = require('../structures/convertTime');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('ข้าม'),

    async execute(interaction) {
        // const userAvatar = res.tracks[0].requester.displayAvatarURL();

        const player = interaction.client.manager.get(interaction.guild.id)

        if (!player) {
            const embed = new EmbedBuilder()
                .setColor(red)
                .setDescription(`> ❌ไม่มีเครื่องเล่น`);

            return interaction.reply({ embeds: [embed], ephemeral: true });
        } else if (!player.playing) {
            const embed = new EmbedBuilder()
                .setColor(red)
                .setDescription(`> ❌ไม่มีเพลงที่เล่นอยู่`);

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

        // await interaction.deferReply({ ephemeral: false });

        player.set('skip', true);


        if (player.queue.size === 0) {
            if (!player.twentyFourSeven) {
                player.twentyFourSeven = false
            }
            
            if (player.twentyFourSeven === false){
                player.destroy();
            };
            // await player.destroy();

            const embed = new EmbedBuilder()
                .setDescription(`⏭️┃ ไม่เหลือเพลงให้ข้าม`)
                .setColor(red)
                .setFooter({ text: 'ข้าม • เพิ่มคิวอัตโนมัติ' });

            return interaction.reply({ embeds: [embed] });
        } else {
            await player.stop();

            const nextTrack = player.queue[0];
            const video_id = nextTrack.uri.split('v=')[1];
            const TimeMusic = convertTime(nextTrack.duration);
            const userAvatar = interaction.user.displayAvatarURL();

            const embed = new EmbedBuilder()
                .setDescription(`⏭️┃**${nextTrack.title}** \` ${TimeMusic} \` \n ขอโดย: ${userMention}`)
                .setColor(config.embed_color)
                .setAuthor({ name: 'Go to Page', iconURL: userAvatar, url: nextTrack.uri })
                .setThumbnail(`https://img.youtube.com/vi/${video_id}/maxresdefault.jpg`)
                .setFooter({ text: 'ข้าม • เพิ่มคิวอัตโนมัติ' });

            // return interaction.editReply({ embeds: [embed] });
            return interaction.reply({ embeds: [embed] });
        }
    }
}