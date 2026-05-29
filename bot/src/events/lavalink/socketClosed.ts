import chalk from "chalk";
import { client } from "../..";
import { getBroadcast } from "../..";

// Close codes that indicate a recoverable disconnection
const RECOVERABLE_CLOSE_CODES = [
    4006, // Session no longer valid
    4009, // Session timed out
    4014, // Disconnected (channel deleted, kicked, etc.)
    4015, // Voice server crashed
];

client.manager.on("socketClosed" as any, async (player, payload) => {
    const guild = client.guilds.cache.get(player.guildId);
    const guildName = guild?.name || 'Unknown';
    
    console.log(`[${chalk.bold.redBright('SOCKET CLOSED')}] Voice connection closed in ${guildName}`);
    console.log(`[${chalk.redBright('DETAILS')}] Code: ${payload.code}, Reason: ${payload.reason || 'No reason provided'}, By Remote: ${payload.byRemote}`);
    
    // Broadcast to SSE clients
    const broadcast = getBroadcast();
    if (broadcast) {
        broadcast(player.guildId, 'voiceDisconnect', {
            code: payload.code,
            reason: payload.reason,
            byRemote: payload.byRemote,
            recovering: RECOVERABLE_CLOSE_CODES.includes(payload.code)
        });
    }

    // Don't try to reconnect if player is being destroyed
    if (player.state === "DESTROYING" || player.state === "DISCONNECTED") {
        console.log(`[${chalk.yellowBright('SOCKET CLOSED')}] Player is ${player.state}, skipping reconnect`);
        return;
    }

    // Check if this is a recoverable disconnection
    if (RECOVERABLE_CLOSE_CODES.includes(payload.code) || payload.byRemote) {
        console.log(`[${chalk.cyanBright('RECONNECT')}] Attempting to reconnect voice in ${guildName}...`);
        
        // Store current state before reconnecting
        const wasPlaying = player.playing;
        const wasPaused = player.paused;
        const currentTrack = player.queue.current;
        const currentPosition = player.position;
        
        try {
            // Wait a short delay before reconnecting to avoid rapid reconnects
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Check if player still exists and has a voice channel
            if (!player.voiceChannel) {
                console.log(`[${chalk.redBright('RECONNECT FAILED')}] No voice channel to reconnect to`);
                return;
            }
            
            // Reconnect to voice channel
            player.connect();
            
            console.log(`[${chalk.greenBright('RECONNECTED')}] Successfully reconnected to voice in ${guildName}`);
            
            // If we were playing before, try to resume playback
            if (currentTrack && (wasPlaying || wasPaused)) {
                // Wait for connection to stabilize
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Resume playback from current position
                if (wasPlaying) {
                    console.log(`[${chalk.greenBright('RESUMING')}] Resuming playback of ${currentTrack.title} at position ${currentPosition}ms`);
                    
                    try {
                        // Seek to the position we were at
                        if (currentPosition > 0) {
                            player.seek(currentPosition);
                        }
                        
                        // Ensure we're not paused
                        if (player.paused) {
                            player.pause(false);
                        }
                        
                        // Broadcast recovery success
                        if (broadcast) {
                            broadcast(player.guildId, 'voiceReconnected', {
                                resumed: true,
                                position: currentPosition,
                                track: currentTrack.title
                            });
                        }
                    } catch (resumeError) {
                        console.error(`[${chalk.redBright('RESUME ERROR')}] Failed to resume playback:`, resumeError);
                    }
                } else if (wasPaused) {
                    console.log(`[${chalk.yellowBright('RECONNECTED')}] Playback was paused, keeping paused state`);
                    
                    // Broadcast recovery success (paused state)
                    if (broadcast) {
                        broadcast(player.guildId, 'voiceReconnected', {
                            resumed: false,
                            position: currentPosition,
                            track: currentTrack.title
                        });
                    }
                }
            }
        } catch (error) {
            console.error(`[${chalk.redBright('RECONNECT ERROR')}] Failed to reconnect:`, error);
            
            // Broadcast reconnect failure
            if (broadcast) {
                broadcast(player.guildId, 'voiceReconnectFailed', {
                    error: String(error)
                });
            }
        }
    } else {
        console.log(`[${chalk.yellowBright('SOCKET CLOSED')}] Non-recoverable close code ${payload.code}, not attempting reconnect`);
    }
});
