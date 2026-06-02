"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const supabase_js_1 = require("@supabase/supabase-js");
const redis_service_1 = require("../redis/redis.service");
const guild_service_1 = require("../guild/guild.service");
let PlayerGateway = class PlayerGateway {
    redis;
    guild;
    server;
    supabase;
    constructor(redis, guild) {
        this.redis = redis;
        this.guild = guild;
        this.supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    }
    afterInit() {
        this.redis.psubscribe('bot:*', (_pattern, channel, message) => {
            const parts = channel.split(':');
            const guildId = parts[1];
            const event = parts.slice(2).join(':');
            let payload;
            try {
                payload = JSON.parse(message);
            }
            catch {
                payload = message;
            }
            this.server.to(`guild:${guildId}`).emit(event, payload);
        });
    }
    async handleConnection(client) {
        const token = client.handshake.auth?.token;
        if (!token) {
            client.emit('error', { code: 401, message: 'Missing token' });
            client.disconnect(true);
            return;
        }
        const { data: { user }, error } = await this.supabase.auth.getUser(token);
        if (error || !user) {
            client.emit('error', { code: 401, message: 'Unauthorized' });
            client.disconnect(true);
            return;
        }
        client.data.user = user;
        const guilds = await this.guild.getUserGuilds(user.id);
        client.emit('connect:ready', { user, guilds });
    }
    async assertMember(client, guildId) {
        const ok = await this.guild.isMember(guildId, client.data.user?.id);
        if (!ok)
            client.emit('error', { code: 403, message: 'Not a member of this guild' });
        return ok;
    }
    async onStateRequest(client, { guildId }) {
        if (!await this.assertMember(client, guildId))
            return;
        client.join(`guild:${guildId}`);
        await this.redis.publish(`backend:request:state:${guildId}`, {});
    }
    async onPlay(client, body) {
        if (!await this.assertMember(client, body.guildId))
            return;
        await this.redis.publish(`backend:${body.guildId}:player:play`, body);
    }
    async onPause(client, { guildId }) {
        if (!await this.assertMember(client, guildId))
            return;
        await this.redis.publish(`backend:${guildId}:player:pause`, {});
    }
    async onSkip(client, { guildId }) {
        if (!await this.assertMember(client, guildId))
            return;
        await this.redis.publish(`backend:${guildId}:player:skip`, {});
    }
    async onSeek(client, body) {
        if (!await this.assertMember(client, body.guildId))
            return;
        await this.redis.publish(`backend:${body.guildId}:player:seek`, { position: body.position });
    }
    async onVolume(client, body) {
        if (!await this.assertMember(client, body.guildId))
            return;
        await this.redis.publish(`backend:${body.guildId}:player:volume`, { volume: body.volume });
    }
    async onLoop(client, body) {
        if (!await this.assertMember(client, body.guildId))
            return;
        await this.redis.publish(`backend:${body.guildId}:player:loop`, { mode: body.mode });
    }
    async onQueueAdd(client, body) {
        if (!await this.assertMember(client, body.guildId))
            return;
        await this.redis.publish(`backend:${body.guildId}:queue:add`, body);
    }
    async onQueueRemove(client, body) {
        if (!await this.assertMember(client, body.guildId))
            return;
        await this.redis.publish(`backend:${body.guildId}:queue:remove`, { index: body.index });
    }
    async onQueueMove(client, body) {
        if (!await this.assertMember(client, body.guildId))
            return;
        await this.redis.publish(`backend:${body.guildId}:queue:move`, { from: body.from, to: body.to });
    }
    async onQueueClear(client, { guildId }) {
        if (!await this.assertMember(client, guildId))
            return;
        await this.redis.publish(`backend:${guildId}:queue:clear`, {});
    }
    async onSettingsGet(client, { guildId }) {
        if (!await this.assertMember(client, guildId))
            return;
        const settings = await this.guild.getSettings(guildId);
        client.emit('settings:data', settings);
    }
    async onSettingsUpdate(client, body) {
        if (!await this.assertMember(client, body.guildId))
            return;
        const { guildId, ...settings } = body;
        const updated = await this.guild.updateSettings(guildId, settings);
        await this.redis.publish(`backend:${guildId}:settings:update`, updated);
        client.emit('settings:data', updated);
    }
};
exports.PlayerGateway = PlayerGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], PlayerGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('state:request'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], PlayerGateway.prototype, "onStateRequest", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('player:play'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], PlayerGateway.prototype, "onPlay", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('player:pause'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], PlayerGateway.prototype, "onPause", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('player:skip'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], PlayerGateway.prototype, "onSkip", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('player:seek'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], PlayerGateway.prototype, "onSeek", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('player:volume'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], PlayerGateway.prototype, "onVolume", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('player:loop'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], PlayerGateway.prototype, "onLoop", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('queue:add'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], PlayerGateway.prototype, "onQueueAdd", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('queue:remove'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], PlayerGateway.prototype, "onQueueRemove", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('queue:move'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], PlayerGateway.prototype, "onQueueMove", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('queue:clear'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], PlayerGateway.prototype, "onQueueClear", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('settings:get'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], PlayerGateway.prototype, "onSettingsGet", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('settings:update'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], PlayerGateway.prototype, "onSettingsUpdate", null);
exports.PlayerGateway = PlayerGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: { origin: process.env.DASHBOARD_URL ?? 'http://localhost:3000' },
    }),
    __metadata("design:paramtypes", [redis_service_1.RedisService,
        guild_service_1.GuildService])
], PlayerGateway);
//# sourceMappingURL=gateway.js.map