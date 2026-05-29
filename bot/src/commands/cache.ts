import { ApplicationCommandType, ChatInputCommandInteraction, EmbedBuilder, HexColorString, MessageFlags } from "discord.js";
import { clientBot } from "../interfaces/client";
import configjson from "../config/config.json";
import { clearAllCache, getCacheStats } from "../functions/cache/autocompleteCache";
import chalk from "chalk";

export default {
    name: 'cache',
    description: 'จัดการ cache ของ autocomplete',
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: 'action',
            description: 'การกระทำ',
            type: 3, // STRING
            required: true,
            choices: [
                {
                    name: 'stats - ดูสถิติ cache',
                    value: 'stats'
                },
                {
                    name: 'clear - ลบ cache ทั้งหมด',
                    value: 'clear'
                }
            ]
        }
    ],
    run: async (client: clientBot, interaction: ChatInputCommandInteraction) => {
        const action = interaction.options.getString('action');

        if (action === 'stats') {
            const stats = getCacheStats();
            
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_color as HexColorString)
                .setTitle('📊 Cache Statistics')
                .addFields([
                    {
                        name: '📁 จำนวนไฟล์ cache',
                        value: `\`${stats.totalFiles}\` ไฟล์`,
                        inline: true
                    },
                    {
                        name: '💾 ขนาดรวม',
                        value: `\`${(stats.totalSize / 1024).toFixed(2)}\` KB`,
                        inline: true
                    },
                    {
                        name: '📅 ไฟล์เก่าสุด',
                        value: stats.oldestFile ? `<t:${Math.floor(stats.oldestFile.getTime() / 1000)}:R>` : 'ไม่มี',
                        inline: true
                    }
                ])
                .setFooter({ text: 'Cache จะหมดอายุภายใน 30 นาที' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            
        } else if (action === 'clear') {
            try {
                const statsBeforeClear = getCacheStats();
                clearAllCache();
                
                console.log(`[${chalk.bold.yellowBright('CACHE')}] Cache cleared by ${interaction.user.tag}`);
                
                const embed = new EmbedBuilder()
                    .setColor(configjson.embed_color as HexColorString)
                    .setTitle('🗑️ Cache Cleared')
                    .setDescription(`✅ ลบ cache ทั้งหมดแล้ว\n\n📊 **ก่อนลบ:**\n• ไฟล์: \`${statsBeforeClear.totalFiles}\`\n• ขนาด: \`${(statsBeforeClear.totalSize / 1024).toFixed(2)} KB\``)
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                
            } catch (error) {
                console.error('Error clearing cache:', error);
                
                const embed = new EmbedBuilder()
                    .setColor(configjson.embed_fail as HexColorString)
                    .setTitle('❌ Error')
                    .setDescription('เกิดข้อผิดพลาดในการลบ cache')
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
        }
    }
}
