import type { BotRuntimeMode } from "./runtime-mode";

export interface GuildSettings {
  guildId: string;
  musicChannelId: string | null;
  volumeLimit: number;
}

export interface GuildSettingsProvider {
  getGuildSettings(guildId: string): Promise<GuildSettings>;
}

export interface CreateGuildSettingsProviderOptions {
  mode: BotRuntimeMode;
  loadFromSupabase: (guildId: string) => Promise<GuildSettings>;
  loadFromConnectedCache: (guildId: string) => Promise<GuildSettings>;
}

export function createGuildSettingsProvider(
  options: CreateGuildSettingsProviderOptions,
): GuildSettingsProvider {
  const standaloneCache = new Map<string, GuildSettings>();

  return {
    async getGuildSettings(guildId: string): Promise<GuildSettings> {
      if (options.mode === "connected") {
        return options.loadFromConnectedCache(guildId);
      }

      const cached = standaloneCache.get(guildId);
      if (cached) {
        return cached;
      }

      const settings = await options.loadFromSupabase(guildId);
      standaloneCache.set(guildId, settings);
      return settings;
    },
  };
}
