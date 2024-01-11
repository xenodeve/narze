const config = require('../../settings/config.json');
const cooldown = config.cooldown_afterQueueEnd * 1000
const chalk = require('chalk');

module.exports = {
	name: 'queueEnd',
	execute(player) {
		if (player.twentyFourSeven) return;

		play_guild = global.play_guild
        play_channel = global.play_channel;

		setTimeout(() => {
			// console.log(`[CAUTION] : QueueEnd => Disconnect Channel: ${play_channel.name} Server: ${play_guild.name}(${player.guild})`);
			console.log(`[${chalk.bold.yellowBright('WARN')}] ${chalk.yellowBright('QueueEnd => Disconnect Channel:')} ${play_channel.name} ${chalk.yellowBright(play_guild.name)}${chalk.yellowBright('(')}${player.guild}${chalk.yellowBright(')')}`);
			player.destroy();
			global.join_statue = false
        	player.set('join', false);
		}, cooldown);
	},
};
