const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const { token, clientId } = require('./settings/config.json');
const fs = require('node:fs');
const chalk = require('chalk');

// Get guildId from command line arguments
const guildId = process.argv[2];

if (!guildId) {
    console.error('Error: Please provide the guildId as a command line argument.');
    process.exit(1);
}

const commands = [];
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log(`[${chalk.bold.greenBright('PUSH')}] Started refreshing application (/) commands on guild.`);

        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands },
        );

        console.log(`[${chalk.bold.greenBright('PUSH')}] Successfully reloaded application (/) commands on guild.`);
    } catch (error) {
        console.error(error);
    }
})();
