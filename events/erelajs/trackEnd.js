module.exports = {
    name: 'queueEnd',
    async execute(interaction) {
        const player = global.player;
        const identifier = player.queue.current.identifier;
        const video_id = global.video_id;
        const autoplay = player.get('autoplay')
        while (autoplay === true) {
            const requester = player.get('requester');
            const search = `https://www.youtube.com/watch?v=${identifier}&list=RD${identifier}`;
            let res = await player.search(search, interaction.user);
            try {
                await player.queue.add(res.tracks[1]);
            } catch (e) {
                ///
            }
        }
    }
}