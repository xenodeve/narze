const chalk = require('chalk');

module.exports = {
	name: 'playerCreate',
	execute(player) {
		player_play = global.player;
		// console.log(`[DEBUG] Player Created from (${player.guild})`);
		console.log(`[${chalk.bold.greenBright('DEBUG')}] ${chalk.greenBright('player create from')} ${chalk.greenBright('(')}${player.guild}${chalk.greenBright(')')}`);
	},
};