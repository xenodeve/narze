import assert from "node:assert/strict";
import test from "node:test";

import { createStateRequestHandler } from "../src/state-request-handler";

test("publishes idle PlayerState for a valid state request with no runtime Guild state", async () => {
  const publishedStates: unknown[] = [];
  const handler = createStateRequestHandler({
    mode: "connected",
    getGuildSettings: async (guildId) => ({
      guildId,
      musicChannelId: null,
      volumeLimit: 80,
    }),
    getRuntimeGuildState: async () => undefined,
    publishStateFull: async (_guildId, state) => {
      publishedStates.push(state);
    },
    publishError: async () => {
      throw new Error("Error should not be published");
    },
    nowIso: () => "2026-06-01T00:00:00.000Z",
  });

  await handler.handleStateRequest("backend:request:state:guild-1", {});

  assert.deepEqual(publishedStates, [
    {
      guildId: "guild-1",
      botMode: "connected",
      isPlaying: false,
      isPaused: false,
      volume: 80,
      loopMode: "off",
      position: 0,
      currentTrack: null,
      queue: [],
      voiceChannelId: null,
    },
  ]);
});

test("publishes invalid_payload when payload guildId does not match state request channel", async () => {
  const publishedStates: unknown[] = [];
  const publishedErrors: unknown[] = [];
  const handler = createStateRequestHandler({
    mode: "connected",
    getGuildSettings: async (guildId) => ({
      guildId,
      musicChannelId: null,
      volumeLimit: 100,
    }),
    getRuntimeGuildState: async () => undefined,
    publishStateFull: async (_guildId, state) => {
      publishedStates.push(state);
    },
    publishError: async (_guildId, error) => {
      publishedErrors.push(error);
    },
    nowIso: () => "2026-06-01T00:00:00.000Z",
  });

  await handler.handleStateRequest("backend:request:state:guild-1", {
    guildId: "guild-2",
  });

  assert.deepEqual(publishedStates, []);
  assert.deepEqual(publishedErrors, [
    {
      errorType: "invalid_payload",
      message: "Invalid state request payload",
      source: "redis",
      action: "state:full",
      guildId: "guild-1",
      timestamp: "2026-06-01T00:00:00.000Z",
    },
  ]);
});

test("normalizes runtime Guild state into PlayerState", async () => {
  const publishedStates: unknown[] = [];
  const handler = createStateRequestHandler({
    mode: "connected",
    getGuildSettings: async (guildId) => ({
      guildId,
      musicChannelId: null,
      volumeLimit: 60,
    }),
    getRuntimeGuildState: async () => ({
      currentTrack: {
        uri: "https://example.test/current",
        title: "",
        artist: "",
        thumbnailUrl: undefined,
        durationMs: 300_000,
        source: "YouTube",
        requesterId: "discord-user-1",
      },
      queue: [
        {
          uri: "https://example.test/next",
          title: "Next track",
          artist: "Next artist",
          thumbnailUrl: "https://example.test/thumb.jpg",
          durationMs: -1,
          source: "SPOTIFY",
          requesterId: "discord-user-2",
        },
      ],
      volume: 80,
      loopMode: "unknown",
      position: 400_000,
      isPaused: true,
      voiceChannelId: "voice-1",
    }),
    publishStateFull: async (_guildId, state) => {
      publishedStates.push(state);
    },
    publishError: async () => {
      throw new Error("Error should not be published");
    },
    nowIso: () => "2026-06-01T00:00:00.000Z",
  });

  await handler.handleStateRequest("backend:request:state:guild-1", null);

  assert.deepEqual(publishedStates, [
    {
      guildId: "guild-1",
      botMode: "connected",
      isPlaying: true,
      isPaused: true,
      volume: 60,
      loopMode: "off",
      position: 300_000,
      currentTrack: {
        uri: "https://example.test/current",
        title: "Unknown title",
        artist: "Unknown artist",
        thumbnailUrl: "",
        durationMs: 300_000,
        source: "youtube",
        requesterId: "discord-user-1",
      },
      queue: [
        {
          uri: "https://example.test/next",
          title: "Next track",
          artist: "Next artist",
          thumbnailUrl: "https://example.test/thumb.jpg",
          durationMs: 0,
          source: "spotify",
          requesterId: "discord-user-2",
        },
      ],
      voiceChannelId: "voice-1",
    },
  ]);
});

test("publishes invalid_payload and skips state when runtime queue contains an invalid Track", async () => {
  const publishedStates: unknown[] = [];
  const publishedErrors: unknown[] = [];
  const handler = createStateRequestHandler({
    mode: "connected",
    getGuildSettings: async (guildId) => ({
      guildId,
      musicChannelId: null,
      volumeLimit: 100,
    }),
    getRuntimeGuildState: async () => ({
      currentTrack: null,
      queue: [
        {
          title: "Missing URI",
          artist: "Artist",
          source: "youtube",
          requesterId: "discord-user-1",
        },
      ],
    }),
    publishStateFull: async (_guildId, state) => {
      publishedStates.push(state);
    },
    publishError: async (_guildId, error) => {
      publishedErrors.push(error);
    },
    nowIso: () => "2026-06-01T00:00:00.000Z",
  });

  await handler.handleStateRequest("backend:request:state:guild-1", {});

  assert.deepEqual(publishedStates, []);
  assert.deepEqual(publishedErrors, [
    {
      errorType: "invalid_payload",
      message: "Invalid PlayerState",
      source: "redis",
      action: "state:full",
      guildId: "guild-1",
      timestamp: "2026-06-01T00:00:00.000Z",
    },
  ]);
});

test("publishes state with defaults before settings_error when Guild settings fail to load", async () => {
  const events: unknown[] = [];
  const handler = createStateRequestHandler({
    mode: "connected",
    getGuildSettings: async () => {
      throw new Error("settings unavailable");
    },
    getRuntimeGuildState: async () => undefined,
    publishStateFull: async (_guildId, state) => {
      events.push({ type: "state", state });
    },
    publishError: async (_guildId, error) => {
      events.push({ type: "error", error });
    },
    nowIso: () => "2026-06-01T00:00:00.000Z",
  });

  await handler.handleStateRequest("backend:request:state:guild-1", {});

  assert.deepEqual(events, [
    {
      type: "state",
      state: {
        guildId: "guild-1",
        botMode: "connected",
        isPlaying: false,
        isPaused: false,
        volume: 100,
        loopMode: "off",
        position: 0,
        currentTrack: null,
        queue: [],
        voiceChannelId: null,
      },
    },
    {
      type: "error",
      error: {
        errorType: "settings_error",
        message: "Failed to load Guild settings",
        source: "supabase",
        action: "state:full",
        guildId: "guild-1",
        timestamp: "2026-06-01T00:00:00.000Z",
      },
    },
  ]);
});

test("publishes command_failed when runtime Guild state cannot be read", async () => {
  const publishedStates: unknown[] = [];
  const publishedErrors: unknown[] = [];
  const handler = createStateRequestHandler({
    mode: "connected",
    getGuildSettings: async (guildId) => ({
      guildId,
      musicChannelId: null,
      volumeLimit: 100,
    }),
    getRuntimeGuildState: async () => {
      throw new Error("runtime unavailable");
    },
    publishStateFull: async (_guildId, state) => {
      publishedStates.push(state);
    },
    publishError: async (_guildId, error) => {
      publishedErrors.push(error);
    },
    nowIso: () => "2026-06-01T00:00:00.000Z",
  });

  await handler.handleStateRequest("backend:request:state:guild-1", {});

  assert.deepEqual(publishedStates, []);
  assert.deepEqual(publishedErrors, [
    {
      errorType: "command_failed",
      message: "Failed to build PlayerState",
      source: "redis",
      action: "state:full",
      guildId: "guild-1",
      timestamp: "2026-06-01T00:00:00.000Z",
    },
  ]);
});

test("does nothing for state requests in Standalone Mode", async () => {
  const handler = createStateRequestHandler({
    mode: "standalone",
    getGuildSettings: async () => {
      throw new Error("Settings should not be loaded in Standalone Mode");
    },
    getRuntimeGuildState: async () => {
      throw new Error("Runtime state should not be loaded in Standalone Mode");
    },
    publishStateFull: async () => {
      throw new Error("State should not be published in Standalone Mode");
    },
    publishError: async () => {
      throw new Error("Error should not be published in Standalone Mode");
    },
    nowIso: () => "2026-06-01T00:00:00.000Z",
  });

  await handler.handleStateRequest("backend:request:state:guild-1", {});
});

test("logs and does not retry when publishing full state fails", async () => {
  const warnings: unknown[] = [];
  const handler = createStateRequestHandler({
    mode: "connected",
    getGuildSettings: async (guildId) => ({
      guildId,
      musicChannelId: null,
      volumeLimit: 100,
    }),
    getRuntimeGuildState: async () => undefined,
    publishStateFull: async () => {
      throw new Error("redis unavailable");
    },
    publishError: async () => {
      throw new Error("Error should not be published when state publish fails");
    },
    nowIso: () => "2026-06-01T00:00:00.000Z",
    logger: {
      warn: (_message, context) => {
        warnings.push(context);
      },
    },
  });

  await handler.handleStateRequest("backend:request:state:guild-1", {});

  assert.deepEqual(warnings, [
    {
      guildId: "guild-1",
      errorMessage: "redis unavailable",
    },
  ]);
});

test("publishes invalid_payload when runtime queue is present but not an array", async () => {
  const publishedStates: unknown[] = [];
  const publishedErrors: unknown[] = [];
  const handler = createStateRequestHandler({
    mode: "connected",
    getGuildSettings: async (guildId) => ({
      guildId,
      musicChannelId: null,
      volumeLimit: 100,
    }),
    getRuntimeGuildState: async () => ({
      queue: { malformed: true },
    }),
    publishStateFull: async (_guildId, state) => {
      publishedStates.push(state);
    },
    publishError: async (_guildId, error) => {
      publishedErrors.push(error);
    },
    nowIso: () => "2026-06-01T00:00:00.000Z",
  });

  await handler.handleStateRequest("backend:request:state:guild-1", {});

  assert.deepEqual(publishedStates, []);
  assert.deepEqual(publishedErrors, [
    {
      errorType: "invalid_payload",
      message: "Invalid PlayerState",
      source: "redis",
      action: "state:full",
      guildId: "guild-1",
      timestamp: "2026-06-01T00:00:00.000Z",
    },
  ]);
});
