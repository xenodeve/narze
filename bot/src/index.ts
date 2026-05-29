import { Client, GatewayIntentBits, Collection } from "discord.js"
import { clientBot } from "./interfaces/client"
import { Handlers } from "./handlers/loader";
import { config } from "dotenv";
import { ManagerCreate } from "./functions/lavalink/manager";
import { EventEmitter } from "events";
import { createAPIServer } from "./api/server";
import { initFirebase } from "./lib/firebase";

config(); //เรียกใช้ dotenv

// Initialize Firebase for play history tracking
initFirebase();

// เพิ่ม max listeners เพื่อป้องกัน warning
EventEmitter.defaultMaxListeners = 50;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessageTyping,
        GatewayIntentBits.MessageContent
    ]
}) as clientBot;

// เพิ่ม max listeners สำหรับ client เฉพาะ
client.setMaxListeners(50);

client.manager = ManagerCreate();
client.commands = new Collection();
client.messageCommands = new Collection();
client.events = new Collection();
client.languages = new Collection();
client.interactions = new Collection();

// เพิ่ม max listeners สำหรับ manager ด้วย
client.manager.setMaxListeners(50);

client.login(process.env.DISCORD_TOKEN);

export {client};

Handlers(); // Load all handlers

// Global broadcast function for SSE (Server-Sent Events)
let broadcastFunction: ((guildId: string, event: string, data: any) => void) | null = null;
let broadcastToUserFunction: ((userId: string, event: string, data: any) => void) | null = null;

export function getBroadcast() {
    return broadcastFunction;
}

export function getBroadcastToUser() {
    return broadcastToUserFunction;
}

// Start API server after bot is ready
client.once('clientReady', () => {
    const apiServer = createAPIServer(client);
    broadcastFunction = (apiServer as any).broadcast;
    broadcastToUserFunction = (apiServer as any).broadcastToUser;
    console.log('✅ SSE broadcast function ready');
});