import { ApplicationCommandType, ChatInputCommandInteraction, GuildMember, EmbedBuilder, HexColorString, MessageFlags, TextChannel, VoiceChannel, PermissionsBitField } from "discord.js";
import { clientBot } from "../../interfaces/client";
import configjson from "../../config/config.json";
import { playerCreate } from "../../functions/lavalink/manager";
import { checkVoiceChannelAccess } from "../../functions/lavalink/voicePermissions";

export default {
    name: 'join',
    description: 'เข้าห้องเสียง',
    type: ApplicationCommandType.ChatInput,
    run: async (client: clientBot, interaction: ChatInputCommandInteraction) => {
        if(!client.manager.initiated) 
            return interaction.reply({ content: 'The bot is not ready yet. Please try again later.', flags: MessageFlags.Ephemeral });

        const member = interaction.member as GuildMember;

        // ตรวจสอบว่า user อยู่ในห้องเสียงหรือไม่
        if (!member.voice || !member.voice.channel) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` กรุณาเข้าห้องเสียงด้วย`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const voiceChannel = member.voice.channel as VoiceChannel;
        
        // ตรวจสอบ permission สำหรับการเข้าห้องเสียง
        const permissionCheck = checkVoiceChannelAccess(voiceChannel, interaction.guild.members.me);
        
        if (!permissionCheck.canAccess) {
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` บอทไม่มีอำนาจเข้าห้อง ${voiceChannel.toString()}`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const textChannel = interaction.channel as TextChannel;
        let player = client.manager.players.get(interaction.guild.id);

        try {
            // สร้าง player ใหม่หากไม่มี
            if (!player) {
                player = await playerCreate(
                    interaction.guild,
                    textChannel,
                    voiceChannel
                );

                // ตั้งค่า volume เริ่มต้น
                if (player.volume === 100 && !(player as any).get('isVolumeChangeCommand')) {
                    player.setVolume(configjson.lavalink_config.volume_default);
                }

                await player.connect();

                const embed = new EmbedBuilder()
                    .setColor(configjson.embed_color as HexColorString)
                    .setDescription(`> \`🔊\` | เข้าห้อง ${voiceChannel.toString()}`);

                return interaction.reply({ embeds: [embed] });
            }

            // ตรวจสอบสถานะของ player
            if (!player.connected) {
                // หาก player ไม่ได้เชื่อมต่อ ให้เชื่อมต่อใหม่
                try {
                    // อัปเดตข้อมูล voice channel หากต่างกัน
                    if (player.voiceChannel !== voiceChannel.id) {
                        await player.destroy();
                        player = await playerCreate(
                            interaction.guild,
                            textChannel,
                            voiceChannel
                        );
                        
                        // ตั้งค่า volume เริ่มต้น
                        if (player.volume === 100 && !(player as any).get('isVolumeChangeCommand')) {
                            player.setVolume(configjson.lavalink_config.volume_default);
                        }
                    }

                    await player.connect();

                    const embed = new EmbedBuilder()
                        .setColor(configjson.embed_color as HexColorString)
                        .setDescription(`> \`🔊\` | เข้าห้อง ${voiceChannel.toString()}`);

                    return interaction.reply({ embeds: [embed] });

                } catch (error) {
                    console.error('Join error:', error);
                    
                    const embed = new EmbedBuilder()
                        .setColor(configjson.embed_fail as HexColorString)
                        .setDescription(`> \`❌\` บอทไม่มีอำนาจเข้าห้อง ${voiceChannel.toString()}`);

                    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                }
            } else {
                // ตรวจสอบว่าอยู่ในห้องเดียวกันหรือไม่
                if (player.voiceChannel === voiceChannel.id) {
                    const embed = new EmbedBuilder()
                        .setColor(configjson.embed_color as HexColorString)
                        .setDescription(`> \`🔊\` | เข้าห้อง ${voiceChannel.toString()} อยู่แล้ว`);

                    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                } else {
                    // ย้ายไปห้องใหม่
                    try {
                        await player.destroy();
                        player = await playerCreate(
                            interaction.guild,
                            textChannel,
                            voiceChannel
                        );
                        
                        // ตั้งค่า volume เริ่มต้น
                        if (player.volume === 100 && !(player as any).get('isVolumeChangeCommand')) {
                            player.setVolume(configjson.lavalink_config.volume_default);
                        }
                        
                        await player.connect();

                        const embed = new EmbedBuilder()
                            .setColor(configjson.embed_color as HexColorString)
                            .setDescription(`> \`🔊\` | ย้ายไปห้อง ${voiceChannel.toString()}`);

                        return interaction.reply({ embeds: [embed] });

                    } catch (error) {
                        console.error('Move channel error:', error);
                        
                        const embed = new EmbedBuilder()
                            .setColor(configjson.embed_fail as HexColorString)
                            .setDescription(`> \`❌\` ไม่สามารถย้ายไปห้อง ${voiceChannel.toString()} ได้`);

                        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                    }
                }
            }

        } catch (error) {
            console.error('Join command error:', error);
            
            const embed = new EmbedBuilder()
                .setColor(configjson.embed_fail as HexColorString)
                .setDescription(`> \`❌\` เกิดข้อผิดพลาดในการเข้าห้อง`);

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    }
}
