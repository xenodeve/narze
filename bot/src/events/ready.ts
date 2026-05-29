import { TerminalInput } from "../handlers/terminalInput";
import { client } from "../index";
import chalk from "chalk";
import { getGuildSettings, upsertGuildSettings } from "../functions/guildSettings";
import { initQueueCacheOnStartup, restoreQueuesFromBackup, setClientReference } from "../functions/cache/queueCache";
import { restoreSessionsOnStartup } from "../functions/history/ListeningSessionManager";
import { initUserCache } from "../functions/cache/userCache";

// ป้องกันการ register event ซ้ำ
if (client.listenerCount("clientReady") === 0) {
    client.on("clientReady", async () => {

        const terminalInput = new TerminalInput(client);
        terminalInput.start();

        console.log(`[${chalk.bold.greenBright('SYSTEM')}] ${chalk.greenBright('All Green!')}\n[${chalk.bold.greenBright('SYSTEM')}] ${client.user.tag} ${chalk.greenBright('Online!')}`);

            client.manager.init(client.user.id);
            
            // Initialize queue cache (restore from backup)
            await initQueueCacheOnStartup();
            
            // Set client reference for live player sync during shutdown
            setClientReference(client);
            
            // Initialize session cache (restore from backup + compare with Firebase)
            await restoreSessionsOnStartup();
            
            // Initialize user cache (in-memory + JSON backup)
            await initUserCache();
            
            // Auto-restore queues after a short delay (wait for Lavalink to be ready)
            setTimeout(async () => {
                console.log(`[${chalk.bold.cyanBright('SYSTEM')}] 🔄 Attempting to restore queues from backup...`);
                const restoredCount = await restoreQueuesFromBackup(client, client.manager);
                if (restoredCount > 0) {
                    console.log(`[${chalk.bold.greenBright('SYSTEM')}] ✅ Restored ${restoredCount} queue(s) from backup`);
                }
            }, 5000); // Wait 5 seconds for Lavalink nodes to connect

            let guilds = client.guilds.cache.size;
            let members = client.guilds.cache.reduce((a, b) => a + b.memberCount, 0);
            let channels = client.channels.cache.size;

            // สร้าง guild settings สำหรับ guild ที่มีอยู่แล้วแต่ยังไม่มี settings
            console.log(`[${chalk.bold.blueBright('GUILD')}] Checking guild settings for ${guilds} guilds...`);
            let createdCount = 0;
            
            for (const [guildId, guild] of client.guilds.cache) {
                try {
                    const existingSettings = await getGuildSettings(guildId);
                    if (!existingSettings) {
                        await upsertGuildSettings({
                            guildId: guildId,
                            guildName: guild.name,
                            ownerId: guild.ownerId, // ใช้ server owner เป็น default
                            musicChannelId: undefined
                        });
                        createdCount++;
                    }
                } catch (error) {
                    console.error(`[${chalk.bold.redBright('GUILD')}] Error creating settings for ${guild.name}:`, error);
                }
            }
            
            if (createdCount > 0) {
                console.log(`[${chalk.bold.greenBright('GUILD')}] Created settings for ${createdCount} guilds`);
            } else {
                console.log(`[${chalk.bold.greenBright('GUILD')}] All guilds already have settings`);
            }

            const activities = [
                `🛠️ Developing | xeno.2004`,
                `🛠️ (Final Phase) | xeno.2004`,
                `🛠️ Update v4 | xeno.2004`,
                // `/help | ${guilds} servers`,
                //`/play <input> | ${members} users`,
                `🎧 /play <input>`,
                `✅ Youtube | xeno.2004`,
                `✅ Youtube Music | xeno.2004`,
                `✅ Spotify | xeno.2004`,
                `✅ SoundCloud | xeno.2004`,
                `✅ Twitch | xeno.2004`,
                `🤝 ${members} users used`,
                //`/filter <menu> | ${channels} channels`,
                // `/filter <menu>`,
                `🔊 ${channels} channels active`,
                // `xenodev | momo team`,
            ]
            
            setInterval(() => {
                client.user.setPresence({
                    activities: [{ name: `${activities[Math.floor(Math.random() * activities.length)]}`, type: 4 }],
                    status: 'idle',
                });
            }, 15000)

        client.application.commands.set([...client.commands.values()]).then(() => {
            console.log(`[${chalk.bold.greenBright('SYSTEM')}] Commands ${chalk.greenBright('set!')}`);
        }).catch((err) => {
            console.error(err);
        });

    });
}