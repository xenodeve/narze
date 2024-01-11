const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const { clientId, token } = require('./settings/config.json');
const chalk = require('chalk');

const rest = new REST({ version: '10' }).setToken(token);


// for global commands
rest.put(Routes.applicationCommands(clientId), { body: [] })
	.then(() => (`[${chalk.bold.yellowBright('CLEAR_GLOBAL')}] ${chalk.yellowBright('Successfully deleted all application commands. ')}(${chalk.bold.yellowBright('CLEAR_GUILD')}`))
	.catch(console.error);