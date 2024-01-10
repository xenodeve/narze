const chalk = require('chalk');

module.exports = {
	name: 'nodeReconnect',
	execute(node) {
	console.log(`[${chalk.bold.yellowBright('WARN')}] ${node.options.identifier} ${chalk.greenBright('reconnected.')}`);
	},
};