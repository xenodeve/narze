export declare class GuildService {
    private supabase;
    constructor();
    getSettings(guildId: string): Promise<any>;
    updateSettings(guildId: string, settings: {
        music_channel_id?: string;
        volume_limit?: number;
    }): Promise<any>;
    getUserGuilds(userId: string): Promise<{
        guild_id: any;
        guild_role: any;
        guilds: {
            id: any;
            name: any;
        }[];
    }[]>;
    isMember(guildId: string, userId: string): Promise<boolean>;
}
