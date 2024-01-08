module.exports = {
	name: 'nodeDisconnect',
	execute(node, player) {
		console.log('[WARN] Node', node.options.identifier, 'disconnected.');
		player.disconnect();
		player.queue.clear();
	},
};