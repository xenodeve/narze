import { ApplicationCommandOptionType, ApplicationCommandType, ChatInputCommandInteraction, GuildMember, EmbedBuilder, HexColorString, MessageFlags } from "discord.js";
import { clientBot } from "../../interfaces/client";
import configjson from "../../config/config.json";

export default {
    name: 'volume',
    description: 'ปรับความดัง',
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: 'amount',
            description: 'ความดัง (%)',
            type: ApplicationCommandOptionType.Integer,
            required: false,
            min_value: 1,
            max_value: 1000
        }
    ],
    run: async (client: clientBot, interaction: ChatInputCommandInteraction) => {
        if(!client.manager.initiated) 
            return interaction.reply({ content: 'The bot is not ready yet. Please try again later.', flags: MessageFlags.Ephemeral });

        const member = interaction.member as GuildMember;
        const amount = interaction.options.getInteger('amount');
        
        // หา player ของ guild พร้อม catch error
        let player;
        try {
            player = client.manager.get(interaction.guild.id);
        } catch (error) {
            // เช็คว่ามี player หรือไม่
            if (!player) {
                const embed = new EmbedBuilder()
                    .setColor(configjson.embed_fail as HexColorString)
                    .setDescription(`> \`❌\` ไม่มีบอทในห้อง`);

                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
        }

        // เช็คว่ามีเพลงเล่นอยู่หรือไม่
        if (!player.playing) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` ไม่มีเพลงที่เล่นอยู่`);

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

        // ถ้าไม่ได้ระบุค่า ให้แสดงความดังปัจจุบัน
        if (!amount) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_color as HexColorString)
                .setDescription(`> \`📢\`┃**เสียง:** \`${player.volume}%\``);

            return interaction.reply({ embeds: [embed] });
        }

        // ตั้งค่าความดัง
        await player.setVolume(amount);

        // แสดงความดังใหม่
        const embed = new EmbedBuilder()
            .setColor(configjson.embed_color as HexColorString)
            .setDescription(`> \`📢\`┃**เสียง:** \`${amount}%\``);
            
        return interaction.reply({ embeds: [embed] });
    }
}
