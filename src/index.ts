import { Client, GatewayIntentBits, Collection } from "discord.js"
import { clientBot } from "./interfaces/client"
import { Handlers } from "./handlers/loader";
import { config } from "dotenv";
import { ManagerCreate } from "./functions/lavalink/manager";
import { EventEmitter } from "events";

config(); //เรียกใช้ dotenv

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