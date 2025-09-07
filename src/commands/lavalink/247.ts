import { ApplicationCommandType, CommandInteraction, GuildMember, EmbedBuilder, HexColorString, MessageFlags } from 'discord.js';
import { clientBot } from '../../interfaces/client';
import configjson from '../../config/config.json';

export default {
    name: '247',
    description: 'Toggle 24/7 mode - keeps bot online in voice channel',
    type: ApplicationCommandType.ChatInput,
    run: async (client: clientBot, interaction: CommandInteraction) => {
        if(!client.manager.initiated) 
            return interaction.reply({ content: 'The bot is not ready yet. Please try again later.', flags: MessageFlags.Ephemeral });

        const member = interaction.member as GuildMember;
        
        // หา player ของ guild พร้อม catch error
        let player;
        try {
            player = client.manager.get(interaction.guild.id);
        } catch (error) {
            // console.error('Error getting player:', error);
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` ไม่มีบอทในห้อง`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // เช็ค voice channel อย่างถูกต้อง
        if (!member.voice || !member.voice.channel) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` กรุณาเข้าห้องเสียงด้วย`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // เช็คว่าอยู่ห้องเดียวกันกับบอทหรือไม่
        if (member.voice.channelId !== player.voiceChannel) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` คุณต้องอยู่ในห้องเดียวกับบอท`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // Toggle 24/7 mode
        try {

            if ((player as any).get('twentyFourSeven')) {
                (player as any).set('twentyFourSeven', false);
                const embed = new EmbedBuilder()
                    .setDescription(`> \`🌙\` | *โหมด 24/7 :* \` ปิดการใช้งาน \``)
                    .setColor(configjson.embed_color as HexColorString);
                return interaction.reply({ embeds: [embed] });
            } else {
                (player as any).set('twentyFourSeven', true);
                const embed = new EmbedBuilder()
                    .setDescription(`> \`🌕\` | *โหมด 24/7 :* \` เปิดการใช้งาน \``)
                    .setColor(configjson.embed_color as HexColorString);
                return interaction.reply({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error toggling 24/7 mode:', error);
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` เกิดข้อผิดพลาดในการเปลี่ยนโหมด 24/7`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    }
}