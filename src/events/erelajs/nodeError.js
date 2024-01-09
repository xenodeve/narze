const chalk = require('chalk');

module.exports = {
	name: 'nodeErrorr',
	execute(node, error) {
		console.log(`[${chalk.bold.redBright('WARN')}] ${node.options.identifier} ${chalk.redBright(error)}`);
	},
};