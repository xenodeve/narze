module.exports = {
	name: 'nodeDisconnect',
	execute(node, player) {
		console.log('[WARN] Node', node.options.identifier, 'disconnected.');
		await 
		player.queue.clear();
		player.destroy();
	},
};