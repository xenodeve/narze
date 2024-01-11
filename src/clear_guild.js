const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const { clientId, guildId, token } = require('./settings/config.json');
const chalk = require('chalk');

const rest = new REST({ version: '10' }).setToken(token);

// for guild-based commands
rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] })
	.then(() => console.log(`[${chalk.bold.yellowBright('CLEAR_GUILD')}] ${chalk.yellowBright('Successfully deleted all guild commands.')}`))
	.catch(console.error);
	