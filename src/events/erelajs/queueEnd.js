const config = require('../../settings/config.json');
const cooldown = config.cooldown_afterQueueEnd * 1000
module.exports = {
	name: 'queueEnd',
	execute(player) {
		if (player.twentyFourSeven) return;

		setTimeout(() => {
			console.log(`[CAUTION] : QueueEnd => Disconnect (${player.guild})`);
			player.destroy();
		}, cooldown);
	},
};
