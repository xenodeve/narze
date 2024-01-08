const { EmbedBuilder } = require('discord.js');
const config = require('../../settings/config.json');
const { convertTime } = require('../../structures/convertTime.js');

module.exports = {
    name: 'trackEnd',
    async execute(interaction, tracks) {

        // play_guild = global.play_guild
        // play_channel = global.play_channel;
        // interaction_player = global.interaction_player;
        // res = global.res;
        // player = global.player;

        // console.log('res : ', res)

        // const userAvatar = global.userAvatar
        // const urls = player.queue[0].uri;
        // const video_id = urls.split('v=')[1];

        // channel_text = global.channel_text;

        // const channel = interaction_player.guild.channels.cache.get(channel_text);

        // const embed = new EmbedBuilder()
        //     .setColor(config.embed_color)
        //     .setAuthor({ name: 'Go to Page', iconURL: userAvatar, url: urls })
        //     .setDescription(`▶️┃**${res.tracks[1].title}** \` ${convertTime(res.tracks[1].duration)} \``)
        //     .setThumbnail(`https://img.youtube.com/vi/${video_id}/maxresdefault.jpg`);

        //     return channel.send({ embeds: [embed], ephemeral: false });

        player = global.player;
        
        const autoplay = player.get('autoplay')
        if (autoplay === true) {
            const requester = player.get('requester');
            const identifier = player.queue.current.identifier;
            const search = `https://www.youtube.com/watch?v=${identifier}&list=RD${identifier}`;
            let res = await player.search(search, requester);
            console.log('autoplay', autoplay, 'requester', requester, 'identifier', identifier, 'search', search, 'res', res)
            try {
                await player.queue.add(res.tracks[1]);
            } catch (e) {
                ///
            }
        }
    }
}