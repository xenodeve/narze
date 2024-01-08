module.exports = {
	name: 'interactionCreate',
	async execute(interaction) {
		if (!interaction.isCommand()) return;

		const command = interaction.client.commands.get(interaction.commandName);

		if (!command) return;

		try {
			await command.execute(interaction);
		} catch (error) {
			console.error(error);
			await interaction.reply({ content: 'Error trying to executing this command.', ephemeral: true });
		}

		// console.log(`[COMMAND] ${interaction.user.tag} Used ${command.name.at(-1)} in ${interaction.guild.name} (${interaction.guild.id})`);
		console.log(`[COMMAND] : ${interaction.user.tag} Used Command in ${interaction.guild.name}(${interaction.guild.id})`);

		global.interactionCreate_guild_id = interaction.guild.id;
	},
};