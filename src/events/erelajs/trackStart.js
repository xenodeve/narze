// trackStart.js
const { EmbedBuilder } = require('discord.js');
const config = require('../../settings/config.json');
const { convertTime } = require('../../structures/convertTime.js');
const chalk = require('chalk');

module.exports = {
    name: 'trackStart',
    async execute(interaction, tracks) { //! ห้ามลบ interaction (ไม่รู้ทำไมแต่ลบแล้ว tracks.uri = null) 
        play_guild = global.play_guild
        play_channel = global.play_channel;
        interaction_player = global.interaction_player;
        player_play = global.player;


        channel_text = global.channel_text;

        const channel = interaction_player.guild.channels.cache.get(channel_text);


        console.log(`[${chalk.bold.greenBright('LAVALINK')}] ${chalk.greenBright('Play')} ${tracks.title} ${chalk.greenBright('in Channel:')} ${play_channel.name} ${chalk.greenBright('Server:')} ${play_guild.name}${chalk.greenBright('(')}${player_play.guild}${chalk.greenBright(')')}`);


        const userAvatar = global.userAvatar
        const urls = tracks.uri;
        if (!urls) {
            console.error('Error: `tracks.uri` is undefined or null.');
            return;
        }
        const video_id = urls.split('v=')[1];


        if (player_play.get('play')) {
            play = player_play.get('play')
        } else {
            play = false
        }

        if (player_play.get('skip')) {
            skip = player_play.get('skip')
        } else {
            skip = false
        }

        if (player_play.get('autoplay')) {
            autoplay = player_play.get('autoplay')
        } else {
            autoplay = false
        }

        if (player_play.get('old_play')) {
            old_play = player_play.get('old_play')
        } else {
            old_play = false
        }

        if (player_play.get('playlist_first')) {
            playlist_first = player_play.get('playlist_first')
        } else {
            playlist_first = false
        }

        if (player_play.get('join')) {
            join = player_play.get('join')
        } else {
            join = false
        }


        console.log('join0:', player_play.get('join'))

        // console.log(`0 play:${play} skip:${skip} autoplay:${autoplay}, oldplayer:${old_play}, playlist_first${playlist_first}`)

        userMention = global.userMention

        if (skip === true && autoplay === true) {

            await player_play.set('skip', false)
            // console.log(`1 play:${play} skip:${skip} autoplay:${autoplay}, oldplayer:${old_play}, playlist_first${playlist_first}`)
            const embed = new EmbedBuilder()
                .setColor(config.embed_color)
                .setDescription(`> \`📻\` | *เล่นอัตโนมัติ* \` เปิด \``)

            channel.send({ embeds: [embed], ephemeral: false });

        } else if (autoplay === true) {

            const embed = new EmbedBuilder()
                .setColor(config.embed_color)
                .setAuthor({ name: 'Go to Page', iconURL: userAvatar, url: urls })
                .setDescription(`\`📻\` | *เล่นอัตโนมัติ :* \` เปิด \` \n\n> **${tracks.title}** \` ${convertTime(tracks.duration)} \` \n> ขอโดย: ${userMention}`)
                .setThumbnail(`https://img.youtube.com/vi/${video_id}/maxresdefault.jpg`);

            channel.send({ embeds: [embed], ephemeral: false });
        } else if (skip === false && autoplay === false  && (old_play === true || playlist_first === true)) {
            console.log(`2 play:${play} skip:${skip} autoplay:${autoplay} oldplayer:${old_play} playlist_first:${playlist_first} join:${join}`)

            player_play.set('play', false);
            // player_play.set('join', false);

            // console.log(`3 play:${play} skip:${skip} autoplay:${autoplay} oldplayer:${old_play} playlist_first:${playlist_first} join:${join}`)

            const embed = new EmbedBuilder()
                .setColor(config.embed_color)
                .setAuthor({ name: 'Go to Page', iconURL: userAvatar, url: urls })
                .setDescription(`▶️┃**${tracks.title}** \` ${convertTime(tracks.duration)} \` \n ขอโดย: ${userMention}`)
                .setThumbnail(`https://img.youtube.com/vi/${video_id}/maxresdefault.jpg`)

            channel.send({ embeds: [embed], ephemeral: false });

        }
    },
};
