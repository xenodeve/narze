import { ApplicationCommandType, CommandInteraction, GuildMember, EmbedBuilder, HexColorString, MessageFlags } from "discord.js";
import { clientBot } from "../../interfaces/client";
import configjson from "../../config/config.json";

export default {
    name: 'clear',
    description: 'เคลียร์คิว',
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
            console.error('Error getting player:', error);
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` เกิดข้อผิดพลาดในการเข้าถึง player`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // เช็คว่ามี player หรือไม่
        if (!player) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` ไม่มีบอทในห้อง`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // เช็คว่ามีเพลงในคิวหรือไม่
        if (!player.queue || player.queue.size === 0) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` ไม่มีเพลงในคิว`);

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

        // เก็บจำนวนเพลงที่จะลบ
        const queueSize = player.queue.size;

        // เคลียร์คิว
        try {
            await player.queue.clear();

            const embed = new EmbedBuilder()
                .setColor(configjson.embed_color as HexColorString)
                .setDescription(`> \`🧹\` | **เคลียร์คิวแล้ว** (\`${queueSize}\` เพลง)`);

            return interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error clearing queue:', error);
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` เกิดข้อผิดพลาดในการเคลียร์คิว`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    }
}
