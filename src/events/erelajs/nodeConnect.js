const chalk = require('chalk');

module.exports = {
	name: 'nodeConnect',
	execute(node) {
		console.log(`[${chalk.bold.greenBright('WARN')}] ${node.options.identifier} ${chalk.greenBright('connected.')}`);
	},
};