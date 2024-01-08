const config = require('../../settings/config.json');
const cooldown = config.cooldown_afterQueueEnd * 1000
module.exports = {
	name: 'queueEnd',
	execute(player) {
		if (player.twentyFourSeven) return;

		play_guild = global.play_guild
        play_channel = global.play_channel;

		setTimeout(() => {
			console.log(`[CAUTION] : QueueEnd => Disconnect Channel: ${play_channel.name} Server: ${play_guild.name}(${player.guild})`);
			player.destroy();
		}, cooldown);
	},
};
