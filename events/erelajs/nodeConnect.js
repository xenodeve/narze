module.exports = {
	name: 'nodeConnect',
	execute(node) {
		console.log('[WARN] Node', node.options.identifier, 'connected.');
	},
};