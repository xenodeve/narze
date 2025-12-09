import { Client, VoiceChannel, TextChannel, Guild, GuildMember } from 'discord.js';
import { loadTracks, playerCreate } from '../functions/lavalink/manager';
import { listGuildsAndChannels, findGuildByName, findVoiceChannelByName } from './guildUtils';
import configjson from '../config/config.json';
import chalk from 'chalk';
import { convertTime } from '../functions/convertTime/convertTime.js';

interface TerminalCommand {
    command: string;
    args: string[];
    timestamp: number;
}

class TerminalCommandHandler {
    private client: Client;
    private commandQueue: TerminalCommand[] = [];
    private isProcessing: boolean = false;

    constructor(client: Client) {
        this.client = client;
        this.startProcessing();
    }

    // เริ่มการประมวลผลคำสั่งจาก terminal
    startProcessing() {
        setInterval(() => {
            this.processCommands();
        }, 1000); // ตรวจสอบทุก 1 วินาที
    }

    // เพิ่มคำสั่งใหม่
    addCommand(commandString: string) {
        const parts = commandString.trim().split(' ');
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);

        this.commandQueue.push({
            command,
            args,
            timestamp: Date.now()
        });

        console.log(`[${chalk.bold.cyan('TERMINAL')}] Added command: ${command} with ${args.length} args`);
    }

    // ประมวลผลคำสั่งในคิว
    private async processCommands() {
        if (this.isProcessing || this.commandQueue.length === 0) return;

        this.isProcessing = true;
        const commandData = this.commandQueue.shift();

        try {
            await this.executeCommand(commandData!);
        } catch (error) {
            console.error(`[${chalk.bold.red('TERMINAL ERROR')}]`, error);
        }

        this.isProcessing = false;
    }

    // ดำเนินการคำสั่ง
    private async executeCommand(commandData: TerminalCommand) {
        const { command, args } = commandData;

        switch (command) {
            case 'play':
                await this.handlePlayCommand(args);
                break;
            case 'stop':
                await this.handleStopCommand(args);
                break;
            case 'skip':
                await this.handleSkipCommand(args);
                break;
            case 'leave':
                await this.handleLeaveCommand(args);
                break;
            case 'status':
                await this.handleStatusCommand(args);
                break;
            case 'list':
            case 'guilds':
                this.handleListCommand();
                break;
            case 'find':
                this.handleFindCommand(args);
                break;
            case 'help':
                this.showHelp();
                break;
            default:
                console.log(`[${chalk.bold.yellow('TERMINAL')}] Unknown command: ${command}`);
                console.log(`[${chalk.bold.cyan('TERMINAL')}] Type "help" for available commands`);
        }
    }

    // คำสั่ง play <query> <guildId|guildName> <voiceChannelId|voiceChannelName> [textChannelId|textChannelName]
    private async handlePlayCommand(args: string[]) {
        if (args.length < 3) {
            console.log(`[${chalk.bold.red('TERMINAL ERROR')}] Usage: play <query> <guildId|guildName> <voiceChannelId|voiceChannelName> [textChannelId|textChannelName]`);
            console.log(`[${chalk.bold.cyan('TERMINAL TIP')}] Text channel is optional - will auto-select if not specified`);
            console.log(`[${chalk.bold.cyan('TERMINAL TIP')}] Use "list" to see available guilds and channels`);
            return;
        }

        let query = args[0];
        const guildIdentifier = args[1];
        const voiceChannelIdentifier = args[2];
        const textChannelIdentifier = args[3]; // Optional parameter

        // ถ้า query มี space ให้รวมเป็น string เดียว (กรณีที่ไม่ใส่ quotes)
        if (args.length > 4) {
            // ตรวจสอบว่า args สุดท้ายเป็น ID หรือไม่
            const possibleGuildId = args[args.length - 3];
            const possibleVoiceId = args[args.length - 2];
            const possibleTextId = args[args.length - 1];
            
            if (possibleGuildId.match(/^\d+$/) && possibleVoiceId.match(/^\d+$/)) {
                // ถ้าเป็น ID ให้ใช้เป็น guild และ voice channel
                query = args.slice(0, args.length - 3).join(' ');
                args[1] = possibleGuildId;
                args[2] = possibleVoiceId;
                args[3] = possibleTextId; // อาจเป็น text channel ID หรือ undefined
            }
        } else if (args.length > 3) {
            // ตรวจสอบว่า args[1] และ args[2] เป็น ID หรือไม่
            const possibleGuildId = args[args.length - 2];
            const possibleVoiceId = args[args.length - 1];
            
            if (possibleGuildId.match(/^\d+$/) && possibleVoiceId.match(/^\d+$/)) {
                // ถ้า 2 args สุดท้ายเป็น ID ให้ใช้เป็น guild และ voice channel
                query = args.slice(0, args.length - 2).join(' ');
                args[1] = possibleGuildId;
                args[2] = possibleVoiceId;
                // args[3] ยังคงเป็น undefined (ไม่ระบุ text channel)
            }
        }

        try {
            // หา guild (รองรับทั้ง ID และชื่อ)
            let guild = this.client.guilds.cache.get(guildIdentifier);
            if (!guild) {
                guild = this.client.guilds.cache.find(g => 
                    g.name.toLowerCase().includes(guildIdentifier.toLowerCase())
                );
            }
            
            if (!guild) {
                console.log(`[${chalk.bold.red('TERMINAL ERROR')}] Guild not found: ${guildIdentifier}`);
                console.log(`[${chalk.bold.cyan('TERMINAL TIP')}] Use "find guild <name>" or "list" to find the correct guild`);
                return;
            }

            // หา voice channel (รองรับทั้ง ID และชื่อ)
            let voiceChannel = guild.channels.cache.get(voiceChannelIdentifier) as VoiceChannel;
            if (!voiceChannel || voiceChannel.type !== 2) {
                voiceChannel = guild.channels.cache.find(channel => 
                    channel.type === 2 && // GUILD_VOICE
                    channel.name.toLowerCase().includes(voiceChannelIdentifier.toLowerCase())
                ) as VoiceChannel;
            }

            if (!voiceChannel || voiceChannel.type !== 2) {
                console.log(`[${chalk.bold.red('TERMINAL ERROR')}] Voice channel not found: ${voiceChannelIdentifier}`);
                console.log(`[${chalk.bold.cyan('TERMINAL TIP')}] Use "find voice ${guild.id} <name>" or "list" to find the correct channel`);
                return;
            }

            // หา text channel (รองรับทั้ง ID และชื่อ หรือ auto-select)
            let textChannel: TextChannel;
            
            if (textChannelIdentifier) {
                // หา text channel ตาม ID หรือชื่อที่ระบุ
                textChannel = guild.channels.cache.get(textChannelIdentifier) as TextChannel;
                if (!textChannel || textChannel.type !== 0) {
                    textChannel = guild.channels.cache.find(channel => 
                        channel.type === 0 && // GUILD_TEXT
                        channel.name.toLowerCase().includes(textChannelIdentifier.toLowerCase()) &&
                        channel.permissionsFor(guild.members.me!)?.has('SendMessages')
                    ) as TextChannel;
                }
                
                if (!textChannel || textChannel.type !== 0) {
                    console.log(`[${chalk.bold.red('TERMINAL ERROR')}] Text channel not found: ${textChannelIdentifier}`);
                    console.log(`[${chalk.bold.cyan('TERMINAL TIP')}] Use "list" to see available text channels`);
                    return;
                }
                
                // ตรวจสอบ permission
                if (!textChannel.permissionsFor(guild.members.me!)?.has('SendMessages')) {
                    console.log(`[${chalk.bold.red('TERMINAL ERROR')}] No permission to send messages in: ${textChannel.name}`);
                    return;
                }
            } else {
                // Auto-select text channel แรกที่บอทสามารถส่งข้อความได้
                textChannel = guild.channels.cache.find(channel => 
                    channel.type === 0 && // GUILD_TEXT
                    channel.permissionsFor(guild.members.me!)?.has('SendMessages')
                ) as TextChannel;

                if (!textChannel) {
                    console.log(`[${chalk.bold.red('TERMINAL ERROR')}] No accessible text channel found in guild`);
                    return;
                }
                
                console.log(`[${chalk.bold.yellow('TERMINAL AUTO')}] Auto-selected text channel: ${textChannel.name} (${textChannel.id})`);
            }

            console.log(`[${chalk.bold.green('TERMINAL')}] Processing play command...`);
            console.log(`[${chalk.bold.cyan('TERMINAL')}] Query: ${query}`);
            console.log(`[${chalk.bold.cyan('TERMINAL')}] Guild: ${guild.name} (${guild.id})`);
            console.log(`[${chalk.bold.cyan('TERMINAL')}] Voice Channel: ${voiceChannel.name} (${voiceChannel.id})`);
            console.log(`[${chalk.bold.cyan('TERMINAL')}] Text Channel: ${textChannel.name} (${textChannel.id})`);

            // สร้าง mock member (ใช้บอทเอง)
            const botMember = guild.members.me!;

            // โหลดเพลง
            const result = await loadTracks(query, botMember);

            if (result.loadType === 'no_results' || result.loadType === 'error') {
                console.log(`[${chalk.bold.red('TERMINAL ERROR')}] No tracks found for query: ${query}`);
                return;
            }

            // สร้าง player
            const player = playerCreate(guild, textChannel, voiceChannel);
            if (player.volume === 100 && !(player as any).get('isVolumeChangeCommand')) {
                await (player as any).setVolume(configjson.lavalink_config.volume_default);
            }

            // เซ็ต flag ว่าเป็นคำสั่งจาก terminal
            (player as any).set('isTerminalCommand', true);

            if (!player.playing) {
                player.connect();
            }

            if (result.loadType === 'track' || result.loadType === 'search') {
                player.queue.add(result.tracks[0]);
                
                if (!player.playing && !player.paused) {
                    await player.play();
                }

                console.log(`[${chalk.bold.green('TERMINAL SUCCESS')}] Added track: ${result.tracks[0].info.title}`);
                console.log(`[${chalk.bold.cyan('TERMINAL')}] Artist: ${result.tracks[0].info.author}`);
                console.log(`[${chalk.bold.cyan('TERMINAL')}] Duration: ${convertTime(result.tracks[0].info.length)}`);

            } else if (result.loadType === 'playlist') {
                result.tracks.forEach(track => {
                    player.queue.add(track);
                });

                if (!player.playing && !player.paused) {
                    await player.play();
                }

                const totalDuration = result.tracks.reduce((total, track) => {
                    return total + (track.info.length || 0);
                }, 0);

                console.log(`[${chalk.bold.green('TERMINAL SUCCESS')}] Added playlist: ${result.playlistInfo.name}`);
                console.log(`[${chalk.bold.cyan('TERMINAL')}] Tracks: ${result.tracks.length}`);
                console.log(`[${chalk.bold.cyan('TERMINAL')}] Total Duration: ${convertTime(totalDuration)}`);
            }

        } catch (error) {
            console.error(`[${chalk.bold.red('TERMINAL ERROR')}] Failed to play:`, error);
        }
    }

    // คำสั่ง stop <guildId>
    private async handleStopCommand(args: string[]) {
        if (args.length < 1) {
            console.log(`[${chalk.bold.red('TERMINAL ERROR')}] Usage: stop <guildId>`);
            return;
        }

        const guildId = args[0];
        const guild = this.client.guilds.cache.get(guildId);
        
        if (!guild) {
            console.log(`[${chalk.bold.red('TERMINAL ERROR')}] Guild not found: ${guildId}`);
            return;
        }

        try {
            const manager = (this.client as any).manager;
            const player = manager.players.get(guildId);
            
            if (player) {
                player.destroy();
                console.log(`[${chalk.bold.green('TERMINAL SUCCESS')}] Stopped player in ${guild.name}`);
            } else {
                console.log(`[${chalk.bold.yellow('TERMINAL')}] No active player in ${guild.name}`);
            }
        } catch (error) {
            console.error(`[${chalk.bold.red('TERMINAL ERROR')}] Failed to stop:`, error);
        }
    }

    // คำสั่ง skip <guildId>
    private async handleSkipCommand(args: string[]) {
        if (args.length < 1) {
            console.log(`[${chalk.bold.red('TERMINAL ERROR')}] Usage: skip <guildId>`);
            return;
        }

        const guildId = args[0];
        const guild = this.client.guilds.cache.get(guildId);
        
        if (!guild) {
            console.log(`[${chalk.bold.red('TERMINAL ERROR')}] Guild not found: ${guildId}`);
            return;
        }

        try {
            const manager = (this.client as any).manager;
            const player = manager.players.get(guildId);
            
            if (player && player.queue.current) {
                const currentTrack = player.queue.current.info.title;
                player.stop();
                console.log(`[${chalk.bold.green('TERMINAL SUCCESS')}] Skipped: ${currentTrack}`);
            } else {
                console.log(`[${chalk.bold.yellow('TERMINAL')}] No track to skip in ${guild.name}`);
            }
        } catch (error) {
            console.error(`[${chalk.bold.red('TERMINAL ERROR')}] Failed to skip:`, error);
        }
    }

    // คำสั่ง leave <guildId>
    private async handleLeaveCommand(args: string[]) {
        if (args.length < 1) {
            console.log(`[${chalk.bold.red('TERMINAL ERROR')}] Usage: leave <guildId>`);
            return;
        }

        const guildId = args[0];
        const guild = this.client.guilds.cache.get(guildId);
        
        if (!guild) {
            console.log(`[${chalk.bold.red('TERMINAL ERROR')}] Guild not found: ${guildId}`);
            return;
        }

        try {
            const manager = (this.client as any).manager;
            const player = manager.players.get(guildId);
            
            if (player) {
                player.destroy();
                console.log(`[${chalk.bold.green('TERMINAL SUCCESS')}] Left voice channel in ${guild.name}`);
            } else {
                console.log(`[${chalk.bold.yellow('TERMINAL')}] Bot is not in a voice channel in ${guild.name}`);
            }
        } catch (error) {
            console.error(`[${chalk.bold.red('TERMINAL ERROR')}] Failed to leave:`, error);
        }
    }

    // คำสั่ง status <guildId>
    private async handleStatusCommand(args: string[]) {
        if (args.length < 1) {
            // แสดงสถานะทุก guild
            console.log(`[${chalk.bold.cyan('TERMINAL STATUS')}] Active Players:`);
            const manager = (this.client as any).manager;
            
            if (manager.players.size === 0) {
                console.log(`[${chalk.bold.yellow('TERMINAL')}] No active players`);
                return;
            }

            manager.players.forEach((player: any, guildId: string) => {
                const guild = this.client.guilds.cache.get(guildId);
                const current = player.queue.current;
                console.log(`[${chalk.bold.cyan('TERMINAL')}] ${guild?.name || guildId}:`);
                console.log(`  - Current: ${current ? current.info.title : 'None'}`);
                console.log(`  - Queue: ${player.queue.size} tracks`);
                console.log(`  - Playing: ${player.playing}`);
                console.log(`  - Paused: ${player.paused}`);
            });
            return;
        }

        const guildId = args[0];
        const guild = this.client.guilds.cache.get(guildId);
        
        if (!guild) {
            console.log(`[${chalk.bold.red('TERMINAL ERROR')}] Guild not found: ${guildId}`);
            return;
        }

        try {
            const manager = (this.client as any).manager;
            const player = manager.players.get(guildId);
            
            if (player) {
                const current = player.queue.current;
                console.log(`[${chalk.bold.cyan('TERMINAL STATUS')}] ${guild.name}:`);
                console.log(`  - Current: ${current ? current.info.title : 'None'}`);
                console.log(`  - Queue: ${player.queue.size} tracks`);
                console.log(`  - Playing: ${player.playing}`);
                console.log(`  - Paused: ${player.paused}`);
                console.log(`  - Volume: ${player.volume}%`);
                if (current) {
                    console.log(`  - Position: ${convertTime(player.position)}/${convertTime(current.info.length)}`);
                }
            } else {
                console.log(`[${chalk.bold.yellow('TERMINAL')}] No active player in ${guild.name}`);
            }
        } catch (error) {
            console.error(`[${chalk.bold.red('TERMINAL ERROR')}] Failed to get status:`, error);
        }
    }

    // แสดงความช่วยเหลือ
    private showHelp() {
        console.log(`\n${chalk.bold.cyan('=== TERMINAL COMMANDS ===')}`)
        console.log(`${chalk.bold.green('play')} <query> <guild> <voice> [text]       - Play a song (silent mode)`);
        console.log(`${chalk.bold.green('stop')} <guildId>                            - Stop playback`);
        console.log(`${chalk.bold.green('skip')} <guildId>                            - Skip current track`);
        console.log(`${chalk.bold.green('leave')} <guildId>                           - Leave voice channel`);
        console.log(`${chalk.bold.green('status')} [guildId]                          - Show player status`);
        console.log(`${chalk.bold.green('list')} / ${chalk.bold.green('guilds')}                              - List all guilds and channels`);
        console.log(`${chalk.bold.green('find')} guild <name>                         - Find guild by name`);
        console.log(`${chalk.bold.green('find')} voice <guildId> <name>                - Find voice channel by name`);
        console.log(`${chalk.bold.green('find')} text <guildId> <name>                 - Find text channel by name`);
        console.log(`${chalk.bold.green('help')}                                     - Show this help`);
        console.log(`\n${chalk.bold.cyan('🔇 SILENT MODE:')} Terminal commands don't send embeds to Discord channels`);
        console.log(`${chalk.bold.yellow('Examples:')}`);
        console.log(`  play "Imagine Dragons Bones" 123456789 987654321`);
        console.log(`  play "song name" "My Server" "General" "music-commands"`);
        console.log(`  find guild "My Server"`);
        console.log(`  find voice 123456789 "General"`);
        console.log(`  find text 123456789 "music"`);
        console.log(`\n${chalk.bold.cyan('📚 Documentation:')} docs/terminal-commands.md, docs/terminal-silent-mode.md`);
        console.log(`\n`);
    }

    // คำสั่งแสดงรายการ guilds และ channels
    private handleListCommand() {
        listGuildsAndChannels(this.client);
    }

    // คำสั่งค้นหา guild หรือ channel
    private handleFindCommand(args: string[]) {
        if (args.length < 2) {
            console.log(`[${chalk.bold.red('TERMINAL ERROR')}] Usage:`);
            console.log(`  find guild <name>`);
            console.log(`  find voice <guildId> <name>`);
            console.log(`  find text <guildId> <name>`);
            return;
        }

        const type = args[0].toLowerCase();
        
        if (type === 'guild') {
            const guildName = args.slice(1).join(' ');
            findGuildByName(this.client, guildName);
        } else if (type === 'voice') {
            if (args.length < 3) {
                console.log(`[${chalk.bold.red('TERMINAL ERROR')}] Usage: find voice <guildId> <name>`);
                return;
            }
            const guildId = args[1];
            const channelName = args.slice(2).join(' ');
            findVoiceChannelByName(this.client, guildId, channelName);
        } else if (type === 'text') {
            if (args.length < 3) {
                console.log(`[${chalk.bold.red('TERMINAL ERROR')}] Usage: find text <guildId> <name>`);
                return;
            }
            const guildId = args[1];
            const channelName = args.slice(2).join(' ');
            this.findTextChannelByName(guildId, channelName);
        } else {
            console.log(`[${chalk.bold.red('TERMINAL ERROR')}] Unknown find type: ${type}`);
            console.log(`Available types: guild, voice, text`);
        }
    }

    // ฟังก์ชันค้นหา Text Channel โดยชื่อ
    private findTextChannelByName(guildId: string, channelName: string) {
        const guild = this.client.guilds.cache.get(guildId);
        
        if (!guild) {
            console.log(`[${chalk.bold.red('TERMINAL ERROR')}] Guild not found: ${guildId}`);
            return null;
        }
        
        const textChannel = guild.channels.cache.find(channel => 
            channel.type === 0 && // GUILD_TEXT
            channel.name.toLowerCase().includes(channelName.toLowerCase())
        );
        
        if (textChannel) {
            const canSend = textChannel.permissionsFor(guild.members.me!)?.has('SendMessages');
            console.log(`[${chalk.bold.green('TERMINAL')}] Found text channel: ${textChannel.name} (${textChannel.id})`);
            console.log(`[${chalk.bold.cyan('TERMINAL')}] Can send messages: ${canSend ? '✅ Yes' : '❌ No'}`);
            return textChannel;
        } else {
            console.log(`[${chalk.bold.red('TERMINAL ERROR')}] Text channel not found: ${channelName}`);
            return null;
        }
    }
}

export { TerminalCommandHandler };
