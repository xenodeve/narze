import { Riffy } from "riffy";
import { client } from "../..";
import { config } from "dotenv";
import { Guild, GuildMember, TextChannel, VoiceChannel } from "discord.js";
import configjson from "../../config/config.json";
import chalk from "chalk";

config(); //เรียกใช้ dotenv

export function ManagerCreate(): Riffy {
  return new Riffy(
    client,
    [
      {
        host: String(process.env.LAVALINK_HOST),
        port: Number(process.env.LAVALINK_PORT),
        password: String(process.env.LAVALINK_PASS),
        secure: process.env.LAVALINK_SECURE === 'true', // เช็ค string literal
      },
    ] as any, {
      defaultSearchPlatform: configjson.lavalink_config.default_search_platform,
      restVersion: "v4",
      reconnectTimeout: 5000,
      reconnectTries: 20,
      bypassChecks: {
      nodeFetchInfo: true,
      },
      send(payload) {
        const guild = client.guilds.cache.get(payload.d.guild_id);
        if (guild) guild.shard.send(payload);
      },
    }
  );
}

export async function loadTracks(query: string, requester: GuildMember) {
    return client.manager.resolve({ query, requester });
} 

export function playerCreate(guild : Guild, textChannel : TextChannel, voiceChannel : VoiceChannel) {
    try {
        // ตรวจสอบว่ามี player อยู่แล้วหรือไม่
        const existingPlayer = client.manager.players.get(guild.id);
        
        if (existingPlayer) {
            // ถ้ามี player แล้ว ให้ตรวจสอบว่า connected หรือไม่
            if (!existingPlayer.connected) {
                console.log(`[${chalk.bold.yellowBright('WARN')}] Reconnecting existing for guild ${guild.name} ${chalk.bold.yellowBright('(')}${guild.id}${chalk.bold.yellowBright(')')}`);
                try {
                    existingPlayer.connect();
                } catch (error) {
                    console.error(`[${chalk.bold.redBright('ERROR')}] Failed to reconnect existing:`, error);
                }
            }
            return existingPlayer;
        }

        // สร้าง player ใหม่
        const player = client.manager.createConnection({
            guildId: guild.id,
            textChannel: textChannel.id,
            voiceChannel: voiceChannel.id,
            deaf: true,
            mute: false,
        });

        // เพิ่ม error handling สำหรับ player
        if (player) {
            // ตั้ง timeout สำหรับการ connect
            setTimeout(() => {
                if (!player.connected) {
                    // console.log(`[${chalk.bold.greenBright('NODE')}] Connecting ${chalk.greenBright('to')} ${guild.name}${chalk.bold.greenBright('(')}${guild.id}${chalk.bold.greenBright(')')}`);
                    try {
                        player.connect();
                        // console.log(`[${chalk.bold.greenBright('NODE')}] Connected ${chalk.greenBright('to')} ${guild.name}${chalk.bold.greenBright('(')}${guild.id}${chalk.bold.greenBright(')')}`);
                    } catch (error) {
                        console.error(`[${chalk.bold.redBright('ERROR')}] Failed to connect ${chalk.redBright('to')} ${guild.name}${chalk.bold.redBright('(')}${guild.id}${chalk.bold.redBright(')')}:`, error);
                    }
                }
            }, 1000);
        }

        return player;
    } catch (error) {
        console.error(`[${chalk.bold.redBright('ERROR')}] Failed to create player for guild ${guild.name} ${chalk.bold.redBright('(')}${guild.id}${chalk.bold.redBright(')')}:`, error);
        throw error;
    }
}