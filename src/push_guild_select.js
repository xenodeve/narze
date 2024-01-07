const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const { token, clientId } = require('../settings/config.json');
const fs = require('node:fs');

// Get guildId from command line arguments
const guildId = process.argv[2];

if (!guildId) {
    console.error('Error: Please provide the guildId as a command line argument.');
    process.exit(1);
}

const commands = [];
const commandFiles = fs.readdirSync('../commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`../commands/${file}`);
    commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log('Push Guild : Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands },
        );

        console.log('Push Guild : Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();
