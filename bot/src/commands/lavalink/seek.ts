import { ApplicationCommandOptionType, ApplicationCommandType, ChatInputCommandInteraction, GuildMember, EmbedBuilder, HexColorString, MessageFlags } from "discord.js";
import { clientBot } from "../../interfaces/client";
import configjson from "../../config/config.json";
import { convertTime } from "../../functions/convertTime/convertTime";

/**
 * แปลงเวลาจากรูปแบบต่างๆ เป็นวินาที
 * @param timeString - เวลาในรูปแบบ "30", "2:30", "1:20:15"
 * @returns จำนวนวินาที หรือ null หากรูปแบบไม่ถูกต้อง
 */
function parseTimeToSeconds(timeString: string): number | null {
    if (!timeString) return null;
    
    // ลบช่องว่างออก
    timeString = timeString.trim();
    
    // ตรวจสอบว่าเป็นตัวเลขเท่านั้น (วินาที)
    if (/^\d+$/.test(timeString)) {
        const seconds = parseInt(timeString);
        return seconds >= 0 ? seconds : null;
    }
    
    // ตรวจสอบรูปแบบ MM:SS หรือ HH:MM:SS
    const timeRegex = /^(?:(\d+):)?(\d+):(\d+)$/;
    const match = timeString.match(timeRegex);
    
    if (!match) {
        // ลองรูปแบบ M:SS (เช่น 2:30)
        const simpleTimeRegex = /^(\d+):(\d+)$/;
        const simpleMatch = timeString.match(simpleTimeRegex);
        
        if (simpleMatch) {
            const minutes = parseInt(simpleMatch[1]);
            const seconds = parseInt(simpleMatch[2]);
            
            if (minutes >= 0 && seconds >= 0 && seconds < 60) {
                return minutes * 60 + seconds;
            }
        }
        return null;
    }
    
    // แปลงจาก HH:MM:SS หรือ MM:SS
    const hours = match[1] ? parseInt(match[1]) : 0;
    const minutes = parseInt(match[2]);
    const seconds = parseInt(match[3]);
    
    // ตรวจสอบความถูกต้อง
    if (hours >= 0 && minutes >= 0 && minutes < 60 && seconds >= 0 && seconds < 60) {
        return hours * 3600 + minutes * 60 + seconds;
    }
    
    return null;
}

export default {
    name: 'seek',
    description: 'ข้ามไปยังเวลาที่ระบุ',
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: 'time',
            description: 'ระบุเวลาที่ต้องการไป (30 หรือ 2:30 หรือ 1:20:15)',
            type: ApplicationCommandOptionType.String,
            required: true
        }
    ],
    run: async (client: clientBot, interaction: ChatInputCommandInteraction) => {
        if(!client.manager.initiated) 
            return interaction.reply({ content: 'The bot is not ready yet. Please try again later.', flags: MessageFlags.Ephemeral });

        const member = interaction.member as GuildMember;
        const time = interaction.options.getString('time');
        const player = client.manager.players.get(interaction.guild.id);

        // ตรวจสอบว่าระบุเวลาหรือไม่
        if (!time) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` กรุณาระบุเวลา`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // แปลงเวลาเป็นวินาที
        const timeInSeconds = parseTimeToSeconds(time);
        if (timeInSeconds === null || timeInSeconds < 0) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` รูปแบบเวลาไม่ถูกต้อง\n> ใช้: \`30\` (วินาที) หรือ \`2:30\` (นาที:วินาที) หรือ \`1:20:15\` (ชั่วโมง:นาที:วินาที)`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // ตรวจสอบว่ามี player หรือไม่
        if (!player) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` ไม่มีบอทในห้อง`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // ตรวจสอบว่ามีการเล่นเพลงอยู่หรือไม่
        if (!player.playing) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` ไม่มีการเล่นเพลงอยู่`);

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

        // ตรวจสอบว่าเวลาที่ระบุไม่เกินความยาวของเพลง
        const currentTrack = player.current;
        if (currentTrack && currentTrack.info.length > 0) {
            const trackDurationSeconds = Math.floor(currentTrack.info.length / 1000);
            if (timeInSeconds > trackDurationSeconds) {
                const embed = new EmbedBuilder()
                    .setColor(configjson.embed_fail as HexColorString)
                    .setDescription(`> \`❌\` เวลาที่ระบุเกินความยาวของเพลง (${convertTime(currentTrack.info.length)})`);

                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
        }

        try {
            // Seek ไปยังเวลาที่ระบุ (แปลงจากวินาทีเป็น milliseconds)
            await player.seek(timeInSeconds * 1000);

            const embed = new EmbedBuilder()
                .setColor(configjson.embed_color as HexColorString)
                .setDescription(`> \`⏭️\`┃ข้ามไป: \` ${convertTime(timeInSeconds * 1000)} \``);

            return interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Seek error:', error);
            
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` ไม่สามารถข้ามไปยังเวลาที่ระบุได้`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    }
}
