/**
 * Registers the slash commands globally (spec #1). Needs DISCORD_TOKEN and DISCORD_CLIENT_ID;
 * not run by any test. Usage: bun scripts/deploy-commands.ts
 */
import { REST, Routes } from "discord.js";
import { commands } from "../src/commands";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
if (!token || !clientId) throw new Error("DISCORD_TOKEN and DISCORD_CLIENT_ID are required");

const body = commands.map((c) => c.data.toJSON());
await new REST().setToken(token).put(Routes.applicationCommands(clientId), { body });
console.log(`[deploy] registered ${body.length} commands`);
