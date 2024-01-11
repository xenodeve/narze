

module.exports = {
    name: 'disconnect',
    async execute(client) {
    console.log('[WARN] Disconnected ',`${client.user.tag}(${client.user.id})`);
}};
