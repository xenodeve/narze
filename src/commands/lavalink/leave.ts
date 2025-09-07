import { ApplicationCommandType, CommandInteraction, GuildMember, EmbedBuilder, HexColorString, MessageFlags } from "discord.js";
import { clientBot } from "../../interfaces/client";
import configjson from "../../config/config.json";

export default {
    name: 'leave',
    description: 'ออกห้องเสียง',
    type: ApplicationCommandType.ChatInput,
    run: async (client: clientBot, interaction: CommandInteraction) => {
        if(!client.manager.initiated) 
            return interaction.reply({ content: 'The bot is not ready yet. Please try again later.', flags: MessageFlags.Ephemeral });

        const member = interaction.member as GuildMember;
        const channel = member.voice?.channel;
        
        // หา player ของ guild พร้อม catch error
        let player;
        try {
            player = client.manager.get(interaction.guild.id);
        } catch (error) {
            if (!player || typeof player === 'undefined') {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` **ไม่มีบอทในห้อง**`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
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

        // ออกจากห้องเสียงและทำลาย player
        try {
            await player.destroy();

            const embed = new EmbedBuilder()
                .setColor(configjson.embed_color as HexColorString)
                .setDescription(`> \`🔊\`| **ออกจากห้อง** ${channel?.toString()}`);

            return interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error destroying player:', error);
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` เกิดข้อผิดพลาดในการออกจากห้องเสียง`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    }
}
