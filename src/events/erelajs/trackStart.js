// trackStart.js
const { EmbedBuilder } = require('discord.js');
const config = require('../../settings/config.json');
const { convertTime } = require('../../structures/convertTime.js');

module.exports = {
    name: 'trackStart',
    async execute(interaction, tracks, player, message, client) {
        // const channel = client.channels.cache.get('id');
        play_guild = global.play_guild
        play_channel = global.play_channel;
        interaction_player = global.interaction_player;
        player_play = global.player;
        guild_id = global.interactionCreate_guild_id;
        

        channel_text = global.channel_text;

        const channel = interaction_player.guild.channels.cache.get(channel_text);


        console.log(`[LAVALINK] : Play ${tracks.title} in Channel: ${play_channel.name} Server: ${play_guild.name}(${guild_id})`);

        // const userAvatar = global.userAvatar
        // const urls = tracks.uri;
        // const video_id = urls.split('v=')[1];

        // const embed = new EmbedBuilder()
        //     .setColor(config.embed_color)
        //     .setAuthor({ name: 'Go to Page', iconURL: userAvatar, url: urls })
        //     .setDescription(`▶️┃**${tracks.title}** \` ${convertTime(tracks.duration)} \``)
        //     .setThumbnail(`https://img.youtube.com/vi/${video_id}/maxresdefault.jpg`);

            // return channel.send({ embeds: [embed], ephemeral: false });
    },
};
