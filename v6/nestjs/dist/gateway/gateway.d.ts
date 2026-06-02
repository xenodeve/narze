import { OnGatewayConnection, OnGatewayInit } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RedisService } from '../redis/redis.service';
import { GuildService } from '../guild/guild.service';
export declare class PlayerGateway implements OnGatewayInit, OnGatewayConnection {
    private readonly redis;
    private readonly guild;
    server: Server;
    private supabase;
    constructor(redis: RedisService, guild: GuildService);
    afterInit(): void;
    handleConnection(client: Socket): Promise<void>;
    private assertMember;
    onStateRequest(client: Socket, { guildId }: {
        guildId: string;
    }): Promise<void>;
    onPlay(client: Socket, body: {
        guildId: string;
        uri: string;
        source: string;
    }): Promise<void>;
    onPause(client: Socket, { guildId }: {
        guildId: string;
    }): Promise<void>;
    onSkip(client: Socket, { guildId }: {
        guildId: string;
    }): Promise<void>;
    onSeek(client: Socket, body: {
        guildId: string;
        position: number;
    }): Promise<void>;
    onVolume(client: Socket, body: {
        guildId: string;
        volume: number;
    }): Promise<void>;
    onLoop(client: Socket, body: {
        guildId: string;
        mode: string;
    }): Promise<void>;
    onQueueAdd(client: Socket, body: {
        guildId: string;
        uri: string;
        source: string;
    }): Promise<void>;
    onQueueRemove(client: Socket, body: {
        guildId: string;
        index: number;
    }): Promise<void>;
    onQueueMove(client: Socket, body: {
        guildId: string;
        from: number;
        to: number;
    }): Promise<void>;
    onQueueClear(client: Socket, { guildId }: {
        guildId: string;
    }): Promise<void>;
    onSettingsGet(client: Socket, { guildId }: {
        guildId: string;
    }): Promise<void>;
    onSettingsUpdate(client: Socket, body: {
        guildId: string;
        music_channel_id?: string;
        volume_limit?: number;
    }): Promise<void>;
}
