// trackStart.js
const { EmbedBuilder } = require('discord.js');
const config = require('../../settings/config.json');
const { convertTime } = require('../../structures/convertTime.js');

module.exports = {
    name: 'trackStart',
    async execute(interaction, tracks, client) {
        const channel = client.channels.cache.get('id');

        console.log(`[LAVALINK] : Play ${tracks.title} in Server: ${interaction.guild.name}(${player.guild})`);

        const userAvatar = global.userAvatar
        const urls = tracks.uri;
        const video_id = urls.split('v=')[1];

        const embed = new EmbedBuilder()
            .setColor(config.embed_color)
            .setAuthor({ name: 'Go to Page', iconURL: userAvatar, url: urls })
            .setDescription(`▶️┃**${tracks.title}** \` ${convertTime(tracks.duration)} \``)
            .setThumbnail(`https://img.youtube.com/vi/${video_id}/maxresdefault.jpg`);

            //client.channel.send({ embeds: [embed], ephemeral: false });
            channel.send('content');

        // if (interaction.reply) {
        //     return interaction.reply({ embeds: [embed], ephemeral: false });
        // } else {
        //     console.error("interaction.reply is not available");
        // }
    },
};
