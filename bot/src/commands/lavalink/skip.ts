import { ApplicationCommandType, CommandInteraction, GuildMember, EmbedBuilder, HexColorString, MessageFlags } from "discord.js";
import { clientBot } from "../../interfaces/client";
import configjson from "../../config/config.json";

export default {
    name: 'skip',
    description: 'ข้าม',
    type: ApplicationCommandType.ChatInput,
    options: [],
    run: async (client: clientBot, interaction: CommandInteraction) => {
        if(!client.manager.initiated) 
            return interaction.reply({ content: 'The bot is not ready yet. Please try again later.', flags: MessageFlags.Ephemeral });

        let player;

        const member = interaction.member as GuildMember;
        try {
            player = client.manager.get(interaction.guild.id);
        } catch {
            if (!player) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` ไม่มีเครื่องเล่น`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
        }
        
        if (!player.playing) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` ไม่มีเพลงที่เล่นอยู่`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } else if (!member.voice || !member.voice.channel) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` กรุณาเข้าห้องเสียงด้วย`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } else if (member.voice.channelId !== player.voiceChannel) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` คุณต้องอยู่ในห้องเดียวกับบอท`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        if (player.queue.size === 0) {
            if (!(player as any).get('twentyFourSeven')) {
                (player as any).set('twentyFourSeven', false);
            }
            
            if ((player as any).get('twentyFourSeven') === false) {
                player.destroy();
            }

            const embed = new EmbedBuilder()
                .setDescription(`\`⏭️\`┃ **ไม่เหลือเพลงให้ข้าม**`)
                .setColor(configjson.embed_fail as HexColorString)
                .setFooter({ text: 'ข้าม • เพิ่มคิวอัตโนมัติ' });

            return interaction.reply({ embeds: [embed] });
        } else {
            await player.stop();
            const userMention = interaction.user.toString();

            (player as any).set('isSkip', true);

            const embed = new EmbedBuilder()
                .setDescription(`\`⏭️\`┃**Skipped** โดย: ${userMention}`)
                .setColor(configjson.embed_color as HexColorString);

            return interaction.reply({ embeds: [embed] });
        }
    }
}
