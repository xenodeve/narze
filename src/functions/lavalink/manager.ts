import { Riffy } from "riffy";
import { client } from "../..";
import { config } from "dotenv";
import { Guild, GuildMember, TextChannel, VoiceChannel } from "discord.js";
import configjson from "../../config/config.json";

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
      defaultSearchPlatform: "ytmsearch",
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
    return client.manager.createConnection({
        guildId: guild.id,
        textChannel: textChannel.id,
        voiceChannel: voiceChannel.id,
        deaf: true,
        mute: false,
        defaultVolume: Number(configjson.lavalink_config.volume_default),
    })
}