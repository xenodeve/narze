import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { RedisService } from '../redis/redis.service';
import { GuildService } from '../guild/guild.service';

@WebSocketGateway({
  cors: { origin: process.env.DASHBOARD_URL ?? 'http://localhost:3000' },
})
export class PlayerGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer() server: Server;

  private supabase: SupabaseClient;

  constructor(
    private readonly redis: RedisService,
    private readonly guild: GuildService,
  ) {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }

  afterInit() {
    // Subscribe to all bot events (ADR-0002) and relay to Socket.io guild rooms
    this.redis.psubscribe('bot:*', (_pattern, channel, message) => {
      // channel: bot:{guildId}:{event...}
      const parts = channel.split(':');
      const guildId = parts[1];
      const event = parts.slice(2).join(':');
      let payload: unknown;
      try { payload = JSON.parse(message); } catch { payload = message; }
      this.server.to(`guild:${guildId}`).emit(event, payload);
    });
  }

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;
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
    await this.guild.upsertUser(user.id, user.user_metadata ?? {});
    const guilds = await this.guild.getUserGuilds(user.id);
    client.emit('connect:ready', { user, guilds });
  }

  private async assertMember(client: Socket, guildId: string): Promise<boolean> {
    const ok = await this.guild.isMember(guildId, client.data.user?.id);
    if (!ok) client.emit('error', { code: 403, message: 'Not a member of this guild' });
    return ok;
  }

  @SubscribeMessage('state:request')
  async onStateRequest(@ConnectedSocket() client: Socket, @MessageBody() { guildId }: { guildId: string }) {
    if (!await this.assertMember(client, guildId)) return;
    client.join(`guild:${guildId}`);
    await this.redis.publish(`backend:request:state:${guildId}`, {});
  }

  @SubscribeMessage('player:play')
  async onPlay(@ConnectedSocket() client: Socket, @MessageBody() body: { guildId: string; uri: string; source: string }) {
    if (!await this.assertMember(client, body.guildId)) return;
    await this.redis.publish(`backend:${body.guildId}:player:play`, body);
  }

  @SubscribeMessage('player:pause')
  async onPause(@ConnectedSocket() client: Socket, @MessageBody() { guildId }: { guildId: string }) {
    if (!await this.assertMember(client, guildId)) return;
    await this.redis.publish(`backend:${guildId}:player:pause`, {});
  }

  @SubscribeMessage('player:skip')
  async onSkip(@ConnectedSocket() client: Socket, @MessageBody() { guildId }: { guildId: string }) {
    if (!await this.assertMember(client, guildId)) return;
    await this.redis.publish(`backend:${guildId}:player:skip`, {});
  }

  @SubscribeMessage('player:seek')
  async onSeek(@ConnectedSocket() client: Socket, @MessageBody() body: { guildId: string; position: number }) {
    if (!await this.assertMember(client, body.guildId)) return;
    await this.redis.publish(`backend:${body.guildId}:player:seek`, { position: body.position });
  }

  @SubscribeMessage('player:volume')
  async onVolume(@ConnectedSocket() client: Socket, @MessageBody() body: { guildId: string; volume: number }) {
    if (!await this.assertMember(client, body.guildId)) return;
    await this.redis.publish(`backend:${body.guildId}:player:volume`, { volume: body.volume });
  }

  @SubscribeMessage('player:loop')
  async onLoop(@ConnectedSocket() client: Socket, @MessageBody() body: { guildId: string; mode: string }) {
    if (!await this.assertMember(client, body.guildId)) return;
    await this.redis.publish(`backend:${body.guildId}:player:loop`, { mode: body.mode });
  }

  @SubscribeMessage('guilds:sync')
  async onGuildsSync(@ConnectedSocket() client: Socket, @MessageBody() body: { guilds: { id: string; name: string }[] }) {
    const userId = client.data.user?.id;
    if (!userId) return;
    await this.guild.syncGuildMemberships(userId, body.guilds ?? []);
  }

  @SubscribeMessage('search:query')
  async onSearchQuery(@ConnectedSocket() client: Socket, @MessageBody() body: { guildId: string; query: string; source?: string }) {
    if (!await this.assertMember(client, body.guildId)) return;
    client.join(`guild:${body.guildId}`);
    await this.redis.publish(`backend:${body.guildId}:search:query`, { query: body.query, source: body.source });
  }

  @SubscribeMessage('queue:add')
  async onQueueAdd(@ConnectedSocket() client: Socket, @MessageBody() body: { guildId: string; uri: string; source: string }) {
    if (!await this.assertMember(client, body.guildId)) return;
    await this.redis.publish(`backend:${body.guildId}:queue:add`, body);
  }

  @SubscribeMessage('queue:remove')
  async onQueueRemove(@ConnectedSocket() client: Socket, @MessageBody() body: { guildId: string; index: number }) {
    if (!await this.assertMember(client, body.guildId)) return;
    await this.redis.publish(`backend:${body.guildId}:queue:remove`, { index: body.index });
  }

  @SubscribeMessage('queue:move')
  async onQueueMove(@ConnectedSocket() client: Socket, @MessageBody() body: { guildId: string; from: number; to: number }) {
    if (!await this.assertMember(client, body.guildId)) return;
    await this.redis.publish(`backend:${body.guildId}:queue:move`, { from: body.from, to: body.to });
  }

  @SubscribeMessage('queue:clear')
  async onQueueClear(@ConnectedSocket() client: Socket, @MessageBody() { guildId }: { guildId: string }) {
    if (!await this.assertMember(client, guildId)) return;
    await this.redis.publish(`backend:${guildId}:queue:clear`, {});
  }

  @SubscribeMessage('settings:get')
  async onSettingsGet(@ConnectedSocket() client: Socket, @MessageBody() { guildId }: { guildId: string }) {
    if (!await this.assertMember(client, guildId)) return;
    const settings = await this.guild.getSettings(guildId);
    client.emit('settings:data', settings);
  }

  @SubscribeMessage('settings:update')
  async onSettingsUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { guildId: string; music_channel_id?: string; volume_limit?: number },
  ) {
    if (!await this.assertMember(client, body.guildId)) return;
    const { guildId, ...settings } = body;
    const updated = await this.guild.updateSettings(guildId, settings);
    await this.redis.publish(`backend:${guildId}:settings:update`, updated);
    client.emit('settings:data', updated);
  }
}
