module.exports = {
	name: 'ready',
	once: true,
	execute(client, interaction) {
		console.log('[WARN]', client.user.username, 'Online!');
		client.manager.init(client.user.id);
	},
};