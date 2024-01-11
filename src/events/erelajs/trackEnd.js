const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'trackEnd',
    async execute(interaction) {

        // console.log('track end')

        player = global.player;
        res = global.res;
        
        const autoplay = player.get('autoplay')
        if (autoplay === true) {
            const requester = player.get('requester');
            const identifier = player.queue.current.identifier;
            // console.log('คิว1 : ',player.queue.length, player.queue.size, player.queue.totalSize, identifier)
            const search = `https://www.youtube.com/watch?v=${identifier}&list=RD${identifier}`;
            let res = await player.search(search, requester);
            // console.log('autoplay', autoplay, 'requester', requester, 'identifier', identifier, 'search', search, 'res', res)
            try {
                await player.queue.add(res.tracks[1]);
                // console.log('คิว2 : ',player.queue.length, player.queue.size, player.queue.totalSize, identifier)
            } catch (e) {
                const embed = new EmbedBuilder()
                .setDescription(`> ❌Autoplay Support Youtubeเท่านั้น`)
                .setColor(red);

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }
    }
}