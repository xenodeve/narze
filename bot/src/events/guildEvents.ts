import { Guild, AuditLogEvent } from "discord.js";
import { client } from "../index";
import { upsertGuildSettings } from "../functions/guildSettings";
import chalk from "chalk";

// Event: เมื่อบอทถูกเชิญเข้า guild ใหม่
if (client.listenerCount("guildCreate") === 0) {
    client.on("guildCreate", async (guild: Guild) => {
        console.log(`[${chalk.bold.blueBright('GUILD')}] ${chalk.blueBright('Joined new guild:')} ${guild.name} (${guild.id})`);

        try {
            // พยายามหาคนที่เชิญบอทเข้ามาจาก Audit Log
            let inviterId: string = guild.ownerId; // Default เป็น server owner

            try {
                // ดึง audit log เพื่อหาว่าใครเชิญบอท
                const auditLogs = await guild.fetchAuditLogs({
                    type: AuditLogEvent.BotAdd,
                    limit: 5
                });

                const botAddLog = auditLogs.entries.find(
                    entry => entry.target?.id === client.user?.id
                );

                if (botAddLog && botAddLog.executor) {
                    inviterId = botAddLog.executor.id;
                    console.log(`[${chalk.bold.blueBright('GUILD')}] Bot invited by: ${botAddLog.executor.tag} (${inviterId})`);
                }
            } catch (auditError) {
                // ถ้าไม่สามารถดู audit log ได้ ใช้ server owner แทน
                console.log(`[${chalk.bold.yellowBright('GUILD')}] Could not fetch audit log, using server owner as bot owner`);
            }

            // บันทึก guild settings
            await upsertGuildSettings({
                guildId: guild.id,
                guildName: guild.name,
                ownerId: inviterId,
                musicChannelId: undefined
            });

            console.log(`[${chalk.bold.greenBright('GUILD')}] Guild settings created for: ${guild.name}`);

            // ถ้ามี system channel ส่งข้อความต้อนรับ
            if (guild.systemChannel) {
                try {
                    await guild.systemChannel.send({
                        content: `👋 **สวัสดี!** ขอบคุณที่เชิญฉันเข้ามา!\n\n` +
                            `🎵 ใช้คำสั่ง \`/play <เพลง>\` เพื่อเล่นเพลง\n` +
                            `⚙️ ใช้คำสั่ง \`/setchannel\` เพื่อตั้งค่า Music Channel\n` +
                            `📖 ใช้คำสั่ง \`/help\` เพื่อดูคำสั่งทั้งหมด`
                    });
                } catch (err) {
                    // ไม่สามารถส่งข้อความได้ - ไม่เป็นไร
                }
            }

        } catch (error) {
            console.error(`[${chalk.bold.redBright('GUILD')}] Error setting up guild:`, error);
        }
    });
}

// Event: เมื่อบอทถูกเตะออกจาก guild
if (client.listenerCount("guildDelete") === 0) {
    client.on("guildDelete", async (guild: Guild) => {
        console.log(`[${chalk.bold.redBright('GUILD')}] ${chalk.redBright('Left guild:')} ${guild.name} (${guild.id})`);
        // Note: ไม่ลบ settings ออกจาก database เผื่อบอทกลับมาใหม่
    });
}
