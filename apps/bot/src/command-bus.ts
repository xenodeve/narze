import { Channels, type CommandResult, type PlayerCommand, PlayerCommandSchema, parseJson } from "@narze/shared";
import type Redis from "ioredis";
import type { Music } from "./music/music";

export interface CommandBusOptions {
  /** A dedicated connection: Redis subscriber mode blocks other commands on it. */
  subscriber: Redis;
  redis: Redis;
  music: Music;
  /** Where notices go for a player started from the Dashboard (Music Channel arrives with #106). */
  textChannelFor: (guildId: string) => string | null;
}

type Outcome = Omit<CommandResult, "id">;
const ok: Outcome = { ok: true };
const fail = (error: string): Outcome => ({ ok: false, error });

/**
 * Carries out commands the Backend relays (#101). Control Permission was already decided there;
 * this side only checks that the Player can do what was asked, and answers every command by id.
 */
export async function startCommandBus({ subscriber, redis, music, textChannelFor }: CommandBusOptions) {
  async function execute({ guildId, actor, command }: PlayerCommand): Promise<Outcome> {
    const status = music.status(guildId);
    if (command.action === "play") {
      // The Backend names the requester's own channel for non-owners: if a Player started meanwhile in
      // another channel, that request no longer holds (ADR-0008).
      if (status && command.voiceChannelId && command.voiceChannelId !== status.voiceChannelId)
        return fail("other-voice");
      const voiceChannelId = status?.voiceChannelId ?? command.voiceChannelId;
      if (!voiceChannelId) return fail("voice-channel-required");
      const textChannelId = textChannelFor(guildId) ?? voiceChannelId;
      const result = await music.play({
        guildId,
        voiceChannelId,
        textChannelId,
        query: command.query,
        requester: actor,
        next: command.next,
      });
      return result.kind === "error" ? fail(result.reason) : ok;
    }
    if (!status) return fail("no-player");
    switch (command.action) {
      case "pause":
      case "resume": {
        if (status.paused === (command.action === "pause")) return ok;
        return (await music.togglePause(guildId)) ? ok : fail("nothing-playing");
      }
      case "skip":
        return (await music.skip(guildId)) ? ok : fail("nothing-playing");
      case "previous":
        return (await music.previous(guildId)) ? ok : fail("nothing-playing");
      case "seek": {
        const length = status.current?.durationMs ?? 0;
        return (await music.seek(guildId, Math.min(command.positionMs, length))) ? ok : fail("nothing-playing");
      }
      case "volume":
        return (await music.setVolume(guildId, command.volume)) ? ok : fail("no-player");
      case "loop":
        return (await music.setLoop(guildId, command.mode)) ? ok : fail("no-player");
      case "shuffle":
        return (await music.shuffle(guildId)) ? ok : fail("queue-too-short");
    }
  }

  const onMessage = async (channel: string, raw: string) => {
    if (channel !== Channels.botCommands) return;
    const command = parseJson(PlayerCommandSchema, raw);
    if (!command) return;
    const outcome = await execute(command).catch((error: unknown) => {
      console.warn(
        `[bot] command ${command.command.action}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return fail("failed");
    });
    const result: CommandResult = { id: command.id, ...outcome };
    await redis.publish(Channels.botCommandResults, JSON.stringify(result)).catch(() => {});
  };

  subscriber.on("message", (channel: string, raw: string) => void onMessage(channel, raw));
  await subscriber.subscribe(Channels.botCommands);
  return async () => {
    await subscriber.quit();
  };
}
