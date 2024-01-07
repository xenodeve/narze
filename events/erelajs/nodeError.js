module.exports = {
	name: 'nodeErrorr',
	execute(node, error) {
		console.log('[WARN]', node.options.identifier, error);
	},
};