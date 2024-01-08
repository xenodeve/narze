// trackStart.js
const { EmbedBuilder } = require('discord.js');
const config = require('../../settings/config.json');
const { convertTime } = require('../../structures/convertTime.js');

module.exports = {
    name: 'trackStart',
    async execute(interaction, tracks, client, message, channel) {
        // const channel = client.channels.cache.get('id');
        play_guild = global.play_guild
        play_channel = global.play_channel;
        interaction_player = global.interaction_player;

        console.log(`[LAVALINK] : Play ${tracks.title} in Channel: ${play_channel.name} Server: ${play_guild.name}(${player.guild})`);

        const userAvatar = global.userAvatar
        const urls = tracks.uri;
        const video_id = urls.split('v=')[1];

        const embed = new EmbedBuilder()
            .setColor(config.embed_color)
            .setAuthor({ name: 'Go to Page', iconURL: userAvatar, url: urls })
            .setDescription(`▶️┃**${tracks.title}** \` ${convertTime(tracks.duration)} \``)
            .setThumbnail(`https://img.youtube.com/vi/${video_id}/maxresdefault.jpg`);

            // interaction.channel.send({ embeds: [embed], ephemeral: false });
            // interaction.channel.send('content');

        // client.on('messageCreate', (message) => {
        //     message.send({ embeds: [embed], ephemeral: false });
        // })

        // if (interaction.reply) {
        //     return interaction.reply({ embeds: [embed], ephemeral: false });
        // } else {
        //     console.error("interaction.reply is not available");
        // }
    },
};
