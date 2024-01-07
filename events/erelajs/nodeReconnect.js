module.exports = {
	name: 'nodeReconnect',
	execute(node) {
	console.log('[WARN] Node', node.options.identifier, 'reconnected');
	},
};