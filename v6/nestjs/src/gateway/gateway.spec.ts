import { Test, TestingModule } from '@nestjs/testing';
import { PlayerGateway } from './gateway';
import { RedisService } from '../redis/redis.service';
import { GuildService } from '../guild/guild.service';
import { Socket } from 'socket.io';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn(),
    },
  })),
}));

describe('PlayerGateway', () => {
  let gateway: PlayerGateway;
  let redisService: RedisService;
  let guildService: GuildService;

  const mockRedisService = {
    publish: jest.fn(),
    psubscribe: jest.fn(),
  };

  const mockGuildService = {
    isMember: jest.fn(),
    getUserGuilds: jest.fn(),
  };

  const mockSocket = {
    join: jest.fn(),
    emit: jest.fn(),
    data: {
      user: { id: 'user-123' },
    },
  } as unknown as Socket;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayerGateway,
        { provide: RedisService, useValue: mockRedisService },
        { provide: GuildService, useValue: mockGuildService },
      ],
    }).compile();

    gateway = module.get<PlayerGateway>(PlayerGateway);
    redisService = module.get<RedisService>(RedisService);
    guildService = module.get<GuildService>(GuildService);

    jest.clearAllMocks();
  });

  describe('onSearchQuery', () => {
    const body = {
      guildId: 'guild-456',
      query: 'test song',
      source: 'youtube',
    };

    it('should not publish to redis if user is not a member of the guild', async () => {
      mockGuildService.isMember.mockResolvedValue(false);

      await gateway.onSearchQuery(mockSocket, body);

      expect(guildService.isMember).toHaveBeenCalledWith(body.guildId, 'user-123');
      expect(redisService.publish).not.toHaveBeenCalled();
      expect(mockSocket.join).not.toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        code: 403,
        message: 'Not a member of this guild',
      });
    });

    it('should join guild room and publish to redis if user is a member', async () => {
      mockGuildService.isMember.mockResolvedValue(true);

      await gateway.onSearchQuery(mockSocket, body);

      expect(guildService.isMember).toHaveBeenCalledWith(body.guildId, 'user-123');
      expect(mockSocket.join).toHaveBeenCalledWith(`guild:${body.guildId}`);
      expect(redisService.publish).toHaveBeenCalledWith(
        `backend:${body.guildId}:search:query`,
        { query: body.query, source: body.source },
      );
    });
  });
});
