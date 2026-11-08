import { Channels, type CommandResult, CommandResultSchema, type PlayerCommand, parseJson } from "@narze/shared";
import { Inject, Injectable } from "@nestjs/common";
import type Redis from "ioredis";
import { REDIS } from "../tokens";

/** How long a command may wait for the Bot before the Dashboard is told it failed. */
export const COMMAND_TIMEOUT_MS = 5000;

/**
 * Sends allowed commands to the Bot over Redis and pairs each answer with its command by id
 * (ADR-0002). A Bot that does not answer in time yields `{ ok: false, error: "timeout" }`.
 */
@Injectable()
export class CommandRelay {
  private readonly pending = new Map<string, (result: CommandResult) => void>();

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  send(command: PlayerCommand): Promise<CommandResult> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(command.id);
        resolve({ id: command.id, ok: false, error: "timeout" });
      }, COMMAND_TIMEOUT_MS);
      this.pending.set(command.id, (result) => {
        clearTimeout(timer);
        this.pending.delete(command.id);
        resolve(result);
      });
      this.redis.publish(Channels.botCommands, JSON.stringify(command)).catch(() => {
        this.pending.get(command.id)?.({ id: command.id, ok: false, error: "failed" });
      });
    });
  }

  /** A message on `bot:command-results`. */
  receive(raw: string): void {
    const result = parseJson(CommandResultSchema, raw);
    if (result) this.pending.get(result.id)?.(result);
  }
}
