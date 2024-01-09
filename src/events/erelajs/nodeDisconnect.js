const chalk = require('chalk');

module.exports = {
	name: 'nodeDisconnect',
	execute(node, player) {
		console.log(`[${chalk.bold.yellowBright('WARN')}] ${node.options.identifier} ${chalk.greenBright('disconnected.')}`);
		// await 
		// player.queue.clear();
		// player.destroy();
	},
};