import { Client } from 'discord.js';
import chalk from 'chalk';

// ฟังก์ชันแสดง Guilds และ Voice Channels
export function listGuildsAndChannels(client: Client) {
    console.log(`\n${chalk.bold.cyan('=== GUILDS AND VOICE CHANNELS ===')}`)
    
    if (client.guilds.cache.size === 0) {
        console.log(chalk.bold.yellow('No guilds found.'));
        return;
    }

    client.guilds.cache.forEach((guild) => {
        console.log(`\n${chalk.bold.green('Guild:')} ${guild.name}`);
        console.log(`${chalk.bold.blue('ID:')} ${guild.id}`);
        console.log(`${chalk.bold.blue('Members:')} ${guild.memberCount}`);
        
        // แสดง Voice Channels
        const voiceChannels = guild.channels.cache.filter(channel => channel.type === 2); // GUILD_VOICE
        
        if (voiceChannels.size === 0) {
            console.log(`${chalk.bold.yellow('  No voice channels')}`);
        } else {
            console.log(`${chalk.bold.cyan('  Voice Channels:')}`);
            voiceChannels.forEach((channel) => {
                const members = channel.members?.size || 0;
                console.log(`    ${chalk.bold.white(channel.name)} - ${chalk.bold.blue(channel.id)} (${members} members)`);
            });
        }

        // แสดง Text Channels (เฉพาะที่บอทสามารถส่งข้อความได้)
        const textChannels = guild.channels.cache.filter(channel => 
            channel.type === 0 // GUILD_TEXT
        );
        
        if (textChannels.size > 0) {
            console.log(`${chalk.bold.cyan('  Text Channels:')}`);
            textChannels.forEach((channel) => {
                const canSend = channel.permissionsFor(guild.members.me!)?.has('SendMessages');
                const status = canSend ? chalk.bold.green('✅') : chalk.bold.red('❌');
                console.log(`    ${chalk.bold.white(channel.name)} - ${chalk.bold.blue(channel.id)} ${status}`);
            });
        }
    });
    
    console.log('\n');
}

// ฟังก์ชันค้นหา Guild โดยชื่อ
export function findGuildByName(client: Client, name: string) {
    const guild = client.guilds.cache.find(g => 
        g.name.toLowerCase().includes(name.toLowerCase())
    );
    
    if (guild) {
        console.log(`${chalk.bold.green('Found guild:')} ${guild.name} (${guild.id})`);
        return guild;
    } else {
        console.log(`${chalk.bold.red('Guild not found:')} ${name}`);
        return null;
    }
}

// ฟังก์ชันค้นหา Voice Channel โดยชื่อ
export function findVoiceChannelByName(client: Client, guildId: string, channelName: string) {
    const guild = client.guilds.cache.get(guildId);
    
    if (!guild) {
        console.log(`${chalk.bold.red('Guild not found:')} ${guildId}`);
        return null;
    }
    
    const voiceChannel = guild.channels.cache.find(channel => 
        channel.type === 2 && // GUILD_VOICE
        channel.name.toLowerCase().includes(channelName.toLowerCase())
    );
    
    if (voiceChannel) {
        console.log(`${chalk.bold.green('Found voice channel:')} ${voiceChannel.name} (${voiceChannel.id})`);
        return voiceChannel;
    } else {
        console.log(`${chalk.bold.red('Voice channel not found:')} ${channelName}`);
        return null;
    }
}
