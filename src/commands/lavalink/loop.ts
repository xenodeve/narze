import { ApplicationCommandOptionType, ApplicationCommandType, ChatInputCommandInteraction, GuildMember, EmbedBuilder, HexColorString, MessageFlags } from "discord.js";
import { clientBot } from "../../interfaces/client";
import configjson from "../../config/config.json";

export default {
    name: 'loop',
    description: 'วนซ้ำ',
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: 'mode',
            description: 'โหมดการวนซ้ำ',
            type: ApplicationCommandOptionType.String,
            required: true,
            choices: [
                { name: '🚫 ปิด', value: 'off' },
                { name: '🔂 เพลงปัจจุบัน', value: 'current' },
                { name: '🔁 ทั้งคิว', value: 'queue' }
            ]
        }
    ],
    run: async (client: clientBot, interaction: ChatInputCommandInteraction) => {
        if(!client.manager.initiated) 
            return interaction.reply({ content: 'The bot is not ready yet. Please try again later.', flags: MessageFlags.Ephemeral });

        const member = interaction.member as GuildMember;
        const choice = interaction.options.getString('mode');
        const player = client.manager.players.get(interaction.guild.id);

        // ตรวจสอบว่ามี player หรือไม่
        if (!player) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` ไม่มีบอทในห้อง`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // ตรวจสอบว่ามีเพลงที่เล่นอยู่หรือไม่
        if (!player.current && player.queue.size === 0) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` ไม่มีเพลงที่เล่นอยู่`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // ตรวจสอบว่า user อยู่ในห้องเสียงหรือไม่
        if (!member.voice || !member.voice.channel) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` กรุณาเข้าห้องเสียงด้วย`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // ตรวจสอบว่า user อยู่ในห้องเดียวกับบอทหรือไม่
        if (interaction.guild.members.me.voice.channel && (member.voice.channelId !== interaction.guild.members.me.voice.channelId)) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` คุณต้องอยู่ในห้องเดียวกับบอท`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // จัดการโหมดการวนซ้ำ
        if (choice === 'current') {
            if (player.loop === 'track') {
                // ปิดการวนซ้ำเพลงปัจจุบัน
                player.setLoop('none');

                const embed = new EmbedBuilder()
                    .setDescription(`> \`🚫\` | ลูปเพลง: \`ปิด\``)
                    .setColor(configjson.embed_color as HexColorString);

                await interaction.reply({ embeds: [embed] });
                // เซ็ต flag ว่าเป็นเพลงแรกจากคำสั่ง play
                await (player as any).set('currentLoop', false);
                await (player as any).set('queueLoop', false);
                await (player as any).set('offLoop', true);
            } else {
                // เปิดการวนซ้ำเพลงปัจจุบัน
                player.setLoop('track');

                const embed = new EmbedBuilder()
                    .setDescription(`> \`🔂\` | ลูปเพลง: \`ปัจจุบัน\``)
                    .setColor(configjson.embed_color as HexColorString);

                await interaction.reply({ embeds: [embed] });
                await (player as any).set('currentLoop', true);
                await (player as any).set('queueLoop', false);
                await (player as any).set('offLoop', false);
            }
        } else if (choice === 'queue') {
            if (player.loop === 'queue') {
                // ปิดการวนซ้ำคิว
                player.setLoop('none');

                const embed = new EmbedBuilder()
                    .setDescription(`> \`🚫\` | ลูปเพลง: \`ปิด\``)
                    .setColor(configjson.embed_color as HexColorString);

                await interaction.reply({ embeds: [embed] });
                await (player as any).set('currentLoop', false);
                await (player as any).set('queueLoop', false);
                await (player as any).set('offLoop', true);
            } else {
                // เปิดการวนซ้ำคิว
                player.setLoop('queue');

                const embed = new EmbedBuilder()
                    .setDescription(`> \`🔁\` | ลูปเพลง: \`คิวทั้งหมด\``)
                    .setColor(configjson.embed_color as HexColorString);

                await interaction.reply({ embeds: [embed] });
                await (player as any).set('currentLoop', false);
                await (player as any).set('queueLoop', true);
                await (player as any).set('offLoop', false);
            }
        } else if (choice === 'off') {
            // ปิดการวนซ้ำทั้งหมด
            if (player.loop !== 'none') {
                player.setLoop('none');

                const embed = new EmbedBuilder()
                    .setDescription(`> \`🚫\` | ลูปเพลง: \`ปิด\``)
                    .setColor(configjson.embed_color as HexColorString);

                await interaction.reply({ embeds: [embed] });
                await (player as any).set('currentLoop', false);
                await (player as any).set('queueLoop', false);
                await (player as any).set('offLoop', true);
            } else {
                const embed = new EmbedBuilder()
                    .setDescription(`> \`🚫\` | ลูปเพลงปิดอยู่แล้ว`)
                    .setColor(configjson.embed_color as HexColorString);

                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
        }
    }
}
