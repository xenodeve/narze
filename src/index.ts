import { Client, GatewayIntentBits, Collection } from "discord.js"
import { clientBot } from "./interfaces/client"
import { Handlers } from "./handlers/loader";
import { TerminalInput } from "./handlers/terminalInput";
import { config } from "dotenv";
import { ManagerCreate } from "./functions/lavalink/manager";

config(); //เรียกใช้ dotenv

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

client.manager = ManagerCreate();
client.commands = new Collection();
client.messageCommands = new Collection();
client.events = new Collection();
client.languages = new Collection();
client.interactions = new Collection();

client.login(process.env.DISCORD_TOKEN);

// เริ่มระบบ Terminal Input หลังจากบอท login
client.once('ready', () => {
    const terminalInput = new TerminalInput(client);
    terminalInput.start();
});

export {client};

Handlers(); // Load all handlers