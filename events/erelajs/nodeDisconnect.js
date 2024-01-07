module.exports = {
	name: 'nodeDisconnect',
	execute(node) {
		console.log('[WARN] Node', node.options.identifier, 'disconnected.');
	},
};