import * as fs from 'fs';

// ===== CPU Usage Tracking =====

let previousCpuTimes: { idle: number; total: number }[] = [];
let currentCpuUsage = 0;

export async function updateCpuUsage() {
    const os = await import('os');
    const cpus = os.cpus();
    
    if (previousCpuTimes.length === cpus.length) {
        let totalDiff = 0;
        let idleDiff = 0;
        
        cpus.forEach((cpu, i) => {
            const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
            const idle = cpu.times.idle;
            
            totalDiff += total - previousCpuTimes[i].total;
            idleDiff += idle - previousCpuTimes[i].idle;
        });
        
        if (totalDiff > 0) {
            currentCpuUsage = ((totalDiff - idleDiff) / totalDiff) * 100;
        }
    }
    
    // Update previous times
    previousCpuTimes = cpus.map(cpu => ({
        idle: cpu.times.idle,
        total: Object.values(cpu.times).reduce((a, b) => a + b, 0)
    }));
}

export function getCpuUsage(): number {
    return currentCpuUsage;
}

// Start CPU usage tracking
setInterval(updateCpuUsage, 1000);
updateCpuUsage(); // Initial call

// ===== User Info Formatting =====

export function formatUserInfo(user?: { username?: string; discordId?: string }): string {
    if (!user || (!user.username && !user.discordId)) {
        return 'Unknown User';
    }
    return `${user.username || 'Unknown'}${user.discordId ? ` (${user.discordId})` : ''}`;
}

// ===== File System Helpers =====

export function getFileSize(filePath: string): number {
    try {
        if (fs.existsSync(filePath)) {
            return fs.statSync(filePath).size;
        }
    } catch { /* ignore */ }
    return 0;
}

export function countJsonEntries(filePath: string): number {
    try {
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            if (Array.isArray(data)) return data.length;
            if (typeof data === 'object' && data !== null) return Object.keys(data).length;
        }
    } catch { /* ignore */ }
    return 0;
}

// ===== Lavalink Helpers =====

export function convertMsToTime(ms: number): string {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function generateProgressBar(current: number, total: number, length: number = 15): string {
    const progress = Math.round((current / total) * length);
    const filled = '▓'.repeat(Math.min(progress, length));
    const empty = '░'.repeat(Math.max(length - progress, 0));
    return filled + empty;
}
