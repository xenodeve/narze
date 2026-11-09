import type { ApplicationCommandDataResolvable } from "discord.js";
import type { Command } from "./types";

/** The part of discord.js's ClientApplication this needs. */
export interface CommandRegistry {
  commands: { set(body: readonly ApplicationCommandDataResolvable[]): Promise<unknown> };
}

/**
 * Tells Discord which slash commands exist (#147). Global, on every start, as v5 did: `set` replaces
 * the whole list, so a command removed here disappears from Discord too.
 */
export async function registerCommands(application: CommandRegistry, list: readonly Command[]): Promise<void> {
  await application.commands.set(list.map((c) => c.data.toJSON()));
}
