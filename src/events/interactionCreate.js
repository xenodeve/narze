const chalk = require('chalk');

module.exports = {
	name: 'interactionCreate',
	async execute(interaction) {

		const command = interaction.client.commands.get(interaction.commandName);

		if (interaction.isCommand()) {

			if (!command) return;

			try {
				await command.execute(interaction);
			} catch (error) {
				console.error(error);
				await interaction.reply({ content: 'Error trying to executing this command.', ephemeral: true });
			}

			console.log(`[${chalk.bold.greenBright('COMMAND')}] ${interaction.user.tag} ${chalk.greenBright('Used')} ${interaction.commandName} ${chalk.greenBright('in')} ${interaction.guild.name}${chalk.greenBright('(')}${interaction.guild.id}${chalk.greenBright(')')}`);

		} else if (interaction.isAutocomplete()) {

			if (!command) {
				console.error(`No command matching ${interaction.commandName} was found.`);
				return;
			}

			try {
				await command.autocomplete(interaction);
			} catch (error) {
				console.error(error);
			}
		}


		global.interactionCreate_guild_id = interaction.guild.id;
	},
};