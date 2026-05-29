import { Client, Collection } from "discord.js";
import { Riffy } from "riffy";

export interface clientBot extends Client {
    languages: Collection<string, Object>,
    commands: Collection<string, any>,
    messageCommands: Collection<string, any>,
    events: Collection<string, any>,
    manager: Riffy, // Lavalink Manager
    interactions: Collection<string, any>,
}
