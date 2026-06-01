import assert from "node:assert/strict";
import test from "node:test";

import { createGuildSettingsProvider } from "../src/guild-settings";

test("Standalone Mode loads guild settings from Supabase and caches per Guild", async () => {
  const calls: string[] = [];
  const provider = createGuildSettingsProvider({
    mode: "standalone",
    loadFromSupabase: async (guildId) => {
      calls.push(guildId);
      return {
        guildId,
        musicChannelId: "music-1",
        volumeLimit: 80,
      };
    },
    loadFromConnectedCache: async () => {
      throw new Error("Connected cache should not be used");
    },
  });

  const first = await provider.getGuildSettings("guild-1");
  const second = await provider.getGuildSettings("guild-1");

  assert.deepEqual(first, second);
  assert.deepEqual(calls, ["guild-1"]);
});

test("Connected Mode loads guild settings from connected settings cache", async () => {
  const connectedCalls: string[] = [];
  const provider = createGuildSettingsProvider({
    mode: "connected",
    loadFromSupabase: async () => {
      throw new Error("Supabase should not be used in Connected Mode");
    },
    loadFromConnectedCache: async (guildId) => {
      connectedCalls.push(guildId);
      return {
        guildId,
        musicChannelId: "music-2",
        volumeLimit: 90,
      };
    },
  });

  const settings = await provider.getGuildSettings("guild-2");

  assert.deepEqual(settings, {
    guildId: "guild-2",
    musicChannelId: "music-2",
    volumeLimit: 90,
  });
  assert.deepEqual(connectedCalls, ["guild-2"]);
});
