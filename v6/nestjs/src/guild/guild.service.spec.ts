import { Test, TestingModule } from '@nestjs/testing';
import { GuildService } from './guild.service';

const mockUpsert = jest.fn();
const mockFrom = jest.fn(() => ({
  upsert: mockUpsert,
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: mockFrom,
  })),
}));

describe('GuildService', () => {
  let service: GuildService;

  beforeEach(async () => {
    jest.clearAllMocks();

    process.env.SUPABASE_URL = 'http://localhost';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

    const module: TestingModule = await Test.createTestingModule({
      providers: [GuildService],
    }).compile();

    service = module.get<GuildService>(GuildService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('upsertUser', () => {
    it('should upsert user with correct metadata (full_name)', async () => {
      mockUpsert.mockResolvedValue({ error: null });
      const userId = 'user1';
      const metadata = { full_name: 'Test User', avatar_url: 'http://avatar.url' };

      await service.upsertUser(userId, metadata);

      expect(mockFrom).toHaveBeenCalledWith('users');
      expect(mockUpsert).toHaveBeenCalledWith({
        id: userId,
        username: metadata.full_name,
        avatar_url: metadata.avatar_url,
        updated_at: expect.any(String),
      });
    });

    it('should fallback to name for username', async () => {
      mockUpsert.mockResolvedValue({ error: null });
      const userId = 'user2';
      const metadata = { name: 'Only Name', avatar_url: 'http://avatar2.url' };

      await service.upsertUser(userId, metadata);

      expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({
        id: userId,
        username: metadata.name,
      }));
    });

    it('should fallback to userId for username', async () => {
      mockUpsert.mockResolvedValue({ error: null });
      const userId = 'user3';

      await service.upsertUser(userId, {});

      expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({
        id: userId,
        username: userId,
        avatar_url: null,
      }));
    });
  });

  describe('syncGuildMemberships', () => {
    it('should not call supabase if guilds array is empty', async () => {
      await service.syncGuildMemberships('user1', []);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('should upsert guild_members rows correctly', async () => {
      mockUpsert.mockResolvedValue({ error: null });
      const userId = 'user1';
      const guilds = [
        { id: 'g1', name: 'Guild 1' },
        { id: 'g2', name: 'Guild 2' },
      ];

      await service.syncGuildMemberships(userId, guilds);

      expect(mockFrom).toHaveBeenCalledWith('guild_members');
      expect(mockUpsert).toHaveBeenCalledWith(
        [
          { user_id: userId, guild_id: 'g1' },
          { user_id: userId, guild_id: 'g2' },
        ],
        { onConflict: 'user_id,guild_id', ignoreDuplicates: true }
      );
    });
  });
});
