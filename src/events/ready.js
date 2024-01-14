const chalk = require('chalk');

module.exports = {
	name: 'ready',
	once: true,
	execute(client, interaction) {
		console.log(`[${chalk.bold.greenBright('WARN')}] ${client.user.tag} ${chalk.greenBright('Online!')}`);
		
		client.manager.init(client.user.id);

		// client.user.setActivity({
		// 	name : 'Early Access',
		// 	type : ActivityType.Watching,
		// })

		let guilds = client.guilds.cache.size;
		let members = client.guilds.cache.reduce((a, b) => a + b.memberCount, 0);
		let channels = client.channels.cache.size;

		const activities = [
			`🛠️ Early Access (Final Phase) | xeno.2004`,
			// `/help | ${guilds} servers`,
			//`/play <input> | ${members} users`,
			`🎧 /play <input>`,
			`🤝 ${members} users used`,
			//`/filter <menu> | ${channels} channels`,
			// `/filter <menu>`,
			`🔊 ${channels} channels active`,
			// `xenodev | momo team`,
		]
		
		setInterval(() => {
			client.user.setPresence({
				activities: [{ name: `${activities[Math.floor(Math.random() * activities.length)]}`, type: 4 }],
				status: 'idle',
			});
		}, 15000)

	},
};