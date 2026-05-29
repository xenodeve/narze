/**
 * Utility functions สำหรับตรวจสอบ permissions ของบอท
 */

import { VoiceChannel, GuildMember, PermissionsBitField } from "discord.js";

/**
 * ตรวจสอบว่าบอทมีสิทธิ์เข้าห้องเสียงและพูดหรือไม่
 * @param voiceChannel - Voice channel ที่ต้องการตรวจสอบ
 * @param botMember - Bot guild member
 * @returns Object ที่บอกผลการตรวจสอบและรายละเอียด
 */
export function checkVoicePermissions(voiceChannel: VoiceChannel, botMember: GuildMember) {
    const permissions = voiceChannel.permissionsFor(botMember);
    
    const hasConnect = permissions?.has(PermissionsBitField.Flags.Connect);
    const hasSpeak = permissions?.has(PermissionsBitField.Flags.Speak);
    const hasViewChannel = permissions?.has(PermissionsBitField.Flags.ViewChannel);
    
    const missingPermissions: string[] = [];
    
    if (!hasViewChannel) {
        missingPermissions.push("View Channel");
    }
    if (!hasConnect) {
        missingPermissions.push("Connect");
    }
    if (!hasSpeak) {
        missingPermissions.push("Speak");
    }
    
    return {
        canJoin: hasConnect && hasSpeak && hasViewChannel,
        hasConnect,
        hasSpeak,
        hasViewChannel,
        missingPermissions,
        detailMessage: missingPermissions.length > 0 
            ? `บอทไม่มีสิทธิ์: ${missingPermissions.join(", ")}`
            : "บอทมีสิทธิ์ครบถ้วน"
    };
}

/**
 * ตรวจสอบว่าบอทมีสิทธิ์ในการใช้งาน voice channel พื้นฐาน
 * @param voiceChannel - Voice channel ที่ต้องการตรวจสอบ
 * @param botMember - Bot guild member
 * @returns boolean - true หากมีสิทธิ์ครบถ้วน
 */
export function hasBasicVoicePermissions(voiceChannel: VoiceChannel, botMember: GuildMember): boolean {
    const permissions = voiceChannel.permissionsFor(botMember);
    return permissions?.has([
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.Connect,
        PermissionsBitField.Flags.Speak
    ]) ?? false;
}

/**
 * ตรวจสอบข้อจำกัดเพิ่มเติมของ voice channel
 * @param voiceChannel - Voice channel ที่ต้องการตรวจสอบ
 * @param botMember - Bot guild member
 * @returns Object ที่บอกข้อจำกัดต่างๆ
 */
export function checkVoiceChannelLimits(voiceChannel: VoiceChannel, botMember: GuildMember) {
    const permissions = voiceChannel.permissionsFor(botMember);
    
    // ตรวจสอบ user limit
    const isFull = voiceChannel.userLimit > 0 && voiceChannel.members.size >= voiceChannel.userLimit;
    const hasManageChannels = permissions?.has(PermissionsBitField.Flags.ManageChannels);
    
    return {
        isFull,
        userLimit: voiceChannel.userLimit,
        currentUsers: voiceChannel.members.size,
        canBypassLimit: hasManageChannels,
        canJoinDespiteFull: !isFull || hasManageChannels,
        limitMessage: isFull && !hasManageChannels 
            ? `ห้องเสียงเต็ม (${voiceChannel.members.size}/${voiceChannel.userLimit})`
            : null
    };
}

/**
 * ฟังก์ชันรวมสำหรับตรวจสอบทุกอย่างที่เกี่ยวกับการเข้า voice channel
 * @param voiceChannel - Voice channel ที่ต้องการตรวจสอบ
 * @param botMember - Bot guild member
 * @returns Object ที่รวมผลการตรวจสอบทั้งหมด
 */
export function checkVoiceChannelAccess(voiceChannel: VoiceChannel, botMember: GuildMember) {
    const permissionCheck = checkVoicePermissions(voiceChannel, botMember);
    const limitCheck = checkVoiceChannelLimits(voiceChannel, botMember);
    
    const canAccess = permissionCheck.canJoin && limitCheck.canJoinDespiteFull;
    
    let errorMessage = "";
    if (!permissionCheck.canJoin) {
        errorMessage = permissionCheck.detailMessage;
    } else if (!limitCheck.canJoinDespiteFull) {
        errorMessage = limitCheck.limitMessage || "ไม่สามารถเข้าห้องได้";
    }
    
    return {
        canAccess,
        errorMessage,
        permissions: permissionCheck,
        limits: limitCheck
    };
}

/**
 * สร้างข้อความ error ที่เหมาะสมสำหรับปัญหา permission
 * @param voiceChannel - Voice channel ที่มีปัญหา
 * @param botMember - Bot guild member
 * @returns string - ข้อความ error ที่ละเอียด
 */
export function getVoicePermissionErrorMessage(voiceChannel: VoiceChannel, botMember: GuildMember): string {
    const check = checkVoiceChannelAccess(voiceChannel, botMember);
    
    if (check.canAccess) {
        return ""; // ไม่มีปัญหา
    }
    
    return `> \`❌\` ${check.errorMessage} ในห้อง ${voiceChannel.toString()}`;
}
