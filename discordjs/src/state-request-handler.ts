import type { GuildSettings } from "./guild-settings";
import type { BotRuntimeMode } from "./runtime-mode";

export interface Track {
  uri: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  durationMs: number;
  source: "youtube" | "spotify" | "soundcloud";
  requesterId: string;
}

export interface PlayerState {
  guildId: string;
  botMode: "connected";
  isPlaying: boolean;
  isPaused: boolean;
  volume: number;
  loopMode: "off" | "track" | "queue";
  position: number;
  currentTrack: Track | null;
  queue: Track[];
  voiceChannelId: string | null;
}

export interface BotErrorPayload {
  errorType:
    | "invalid_payload"
    | "command_failed"
    | "lavalink_error"
    | "settings_error";
  message: string;
  source: "redis" | "discord" | "lavalink" | "supabase";
  action?: string;
  guildId: string;
  timestamp: string;
}

export interface RuntimeGuildState {
  currentTrack?: unknown;
  queue?: unknown;
  volume?: unknown;
  loopMode?: unknown;
  position?: unknown;
  isPaused?: unknown;
  voiceChannelId?: unknown;
}

export interface StateRequestHandler {
  handleStateRequest(
    channel: string,
    payload: unknown,
  ): Promise<StateRequestResult>;
}

export interface StateRequestResult {
  statePublished: boolean;
}

export interface StateRequestLogger {
  debug?: (message: string, context?: Record<string, unknown>) => void;
  warn?: (message: string, context?: Record<string, unknown>) => void;
  error?: (message: string, context?: Record<string, unknown>) => void;
}

export interface CreateStateRequestHandlerOptions {
  mode: BotRuntimeMode;
  getGuildSettings: (guildId: string) => Promise<GuildSettings>;
  getRuntimeGuildState: (
    guildId: string,
  ) => Promise<RuntimeGuildState | null | undefined>;
  publishStateFull: (guildId: string, state: PlayerState) => Promise<void>;
  publishError: (guildId: string, error: BotErrorPayload) => Promise<void>;
  nowIso: () => string;
  logger?: StateRequestLogger;
}

const STATE_REQUEST_CHANNEL_PREFIX = "backend:request:state:";

export function createStateRequestHandler(
  options: CreateStateRequestHandlerOptions,
): StateRequestHandler {
  return {
    async handleStateRequest(
      channel: string,
      payload: unknown,
    ): Promise<StateRequestResult> {
      if (options.mode !== "connected") {
        return { statePublished: false };
      }

      const guildId = parseStateRequestGuildId(channel);
      if (!guildId) {
        options.logger?.warn?.("Ignoring invalid state request channel", {
          channel,
        });
        return { statePublished: false };
      }

      if (!isValidStateRequestPayload(payload, guildId)) {
        await options.publishError(guildId, {
          errorType: "invalid_payload",
          message: "Invalid state request payload",
          source: "redis",
          action: "state:full",
          guildId,
          timestamp: options.nowIso(),
        });
        return { statePublished: false };
      }

      const settingsResult = await getSettingsOrDefault(options, guildId);
      const runtimeState = await getRuntimeStateOrError(options, guildId);
      if (runtimeState.failed) {
        await options.publishError(guildId, {
          errorType: "command_failed",
          message: "Failed to build PlayerState",
          source: "redis",
          action: "state:full",
          guildId,
          timestamp: options.nowIso(),
        });
        return { statePublished: false };
      }

      const state = tryBuildPlayerState(
        guildId,
        settingsResult.settings,
        runtimeState.state,
      );
      if (!state) {
        await options.publishError(guildId, {
          errorType: "invalid_payload",
          message: "Invalid PlayerState",
          source: "redis",
          action: "state:full",
          guildId,
          timestamp: options.nowIso(),
        });
        return { statePublished: false };
      }

      try {
        await options.publishStateFull(guildId, state);
      } catch (error) {
        options.logger?.warn?.("Failed to publish full PlayerState", {
          guildId,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        return { statePublished: false };
      }

      if (settingsResult.failed) {
        await options.publishError(guildId, {
          errorType: "settings_error",
          message: "Failed to load Guild settings",
          source: "supabase",
          action: "state:full",
          guildId,
          timestamp: options.nowIso(),
        });
      }

      return { statePublished: true };
    },
  };
}

async function getRuntimeStateOrError(
  options: CreateStateRequestHandlerOptions,
  guildId: string,
): Promise<
  | { failed: false; state: RuntimeGuildState | null | undefined }
  | { failed: true }
> {
  try {
    return {
      failed: false,
      state: await options.getRuntimeGuildState(guildId),
    };
  } catch {
    options.logger?.error?.("Failed to read runtime Guild state", { guildId });
    return { failed: true };
  }
}

async function getSettingsOrDefault(
  options: CreateStateRequestHandlerOptions,
  guildId: string,
): Promise<{ settings: GuildSettings; failed: boolean }> {
  try {
    return {
      settings: await options.getGuildSettings(guildId),
      failed: false,
    };
  } catch {
    options.logger?.warn?.("Failed to load Guild settings", { guildId });
    return {
      settings: {
        guildId,
        musicChannelId: null,
        volumeLimit: 100,
      },
      failed: true,
    };
  }
}

function tryBuildPlayerState(
  guildId: string,
  settings: GuildSettings,
  runtimeState: RuntimeGuildState | null | undefined,
): PlayerState | null {
  try {
    return buildPlayerState(guildId, settings, runtimeState);
  } catch {
    return null;
  }
}

function isValidStateRequestPayload(
  payload: unknown,
  channelGuildId: string,
): boolean {
  if (payload === undefined || payload === null) {
    return true;
  }

  if (
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return false;
  }

  if (!("guildId" in payload)) {
    return true;
  }

  return payload.guildId === channelGuildId;
}

function parseStateRequestGuildId(channel: string): string | null {
  if (!channel.startsWith(STATE_REQUEST_CHANNEL_PREFIX)) {
    return null;
  }

  const guildId = channel.slice(STATE_REQUEST_CHANNEL_PREFIX.length).trim();
  return guildId.length > 0 ? guildId : null;
}

function buildPlayerState(
  guildId: string,
  settings: GuildSettings,
  runtimeState: RuntimeGuildState | null | undefined,
): PlayerState {
  const volumeLimit = normalizeVolumeLimit(settings.volumeLimit);
  const currentTrack = normalizeOptionalTrack(runtimeState?.currentTrack);
  const queue = normalizeQueue(runtimeState?.queue);
  const position = normalizePosition(runtimeState?.position, currentTrack);

  return {
    guildId,
    botMode: "connected",
    isPlaying: currentTrack !== null,
    isPaused: currentTrack !== null && runtimeState?.isPaused === true,
    volume: normalizeVolume(runtimeState?.volume, volumeLimit),
    loopMode: normalizeLoopMode(runtimeState?.loopMode),
    position,
    currentTrack,
    queue,
    voiceChannelId: normalizeVoiceChannelId(runtimeState?.voiceChannelId),
  };
}

function normalizeVolumeLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 100;
  }

  return Math.min(Math.max(value, 0), 100);
}

function normalizeVolume(value: unknown, volumeLimit: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return Math.min(100, volumeLimit);
  }

  return Math.min(Math.max(value, 0), volumeLimit);
}

function normalizeLoopMode(value: unknown): PlayerState["loopMode"] {
  return value === "track" || value === "queue" ? value : "off";
}

function normalizePosition(value: unknown, currentTrack: Track | null): number {
  if (!currentTrack || currentTrack.durationMs <= 0) {
    return 0;
  }

  const position = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.min(Math.max(position, 0), currentTrack.durationMs);
}

function normalizeVoiceChannelId(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : null;
}

function normalizeQueue(value: unknown): Track[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("Invalid queue");
  }

  return value.map((item) => normalizeRequiredTrack(item));
}

function normalizeOptionalTrack(value: unknown): Track | null {
  if (value === undefined || value === null) {
    return null;
  }

  return normalizeRequiredTrack(value);
}

function normalizeRequiredTrack(value: unknown): Track {
  if (!isRecord(value)) {
    throw new Error("Invalid Track");
  }

  const uri = requiredString(value.uri);
  const requesterId = requiredString(value.requesterId);

  return {
    uri,
    title: displayString(value.title, "Unknown title"),
    artist: displayString(value.artist, "Unknown artist"),
    thumbnailUrl: optionalString(value.thumbnailUrl),
    durationMs: normalizeDurationMs(value.durationMs),
    source: normalizeSource(value.source),
    requesterId,
  };
}

function normalizeSource(value: unknown): Track["source"] {
  if (typeof value !== "string") {
    throw new Error("Invalid Track source");
  }

  const source = value.toLowerCase();
  if (source === "youtube" || source === "spotify" || source === "soundcloud") {
    return source;
  }

  throw new Error("Invalid Track source");
}

function normalizeDurationMs(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return value;
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Required string is missing");
  }

  return value;
}

function displayString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function optionalString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
