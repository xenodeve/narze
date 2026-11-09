"use client";

import type { ControlAck, ControlReason, ControlRequest, PlayerAction } from "@narze/shared";
import { SocketEvents } from "@narze/shared/channels";
import { currentAccessToken } from "./session";
import { getSocket } from "./socket";

export type { ControlAck };

/**
 * Sends one playback action for a Guild with the tab's current token (it refreshes hourly; the
 * handshake token does not). The Backend decides Control Permission (ADR-0008).
 */
export async function sendCommand(guildId: string, command: PlayerAction): Promise<ControlAck> {
  const token = currentAccessToken();
  if (!token) return { ok: false, error: "unauthorized" };
  const socket = await getSocket();
  const request: ControlRequest = { guildId, command, token };
  try {
    return (await socket.timeout(7000).emitWithAck(SocketEvents.playerCommand, request)) as ControlAck;
  } catch {
    return { ok: false, error: "timeout" };
  }
}

/** Thai meaning of each Control Permission reason (the v5 English strings are CONTROL_REASON_TEXT). */
export const REASON_TH: Record<ControlReason, string> = {
  "server-owner": "คุณเป็นเจ้าของเซิร์ฟเวอร์ สั่งได้จากทุกที่",
  "bot-owner": "คุณเป็นคนเชิญบอท สั่งได้จากทุกที่",
  "in-voice": "ยังไม่มีเพลง เริ่มเล่นได้เลย",
  "join-voice": "เข้าห้องเสียงก่อนถึงจะเริ่มเล่นได้",
  "in-bot-voice": "คุณอยู่ห้องเสียงเดียวกับบอท",
  "not-in-voice": "เข้าห้องเสียงก่อนถึงจะควบคุมบอทได้",
  "other-voice": "ต้องอยู่ห้องเสียงเดียวกับบอทถึงจะควบคุมได้",
  "own-voice-only": "เริ่มเล่นได้เฉพาะในห้องเสียงที่คุณอยู่",
};

/** Thai text for a failed command's error code. */
export const ERROR_TH: Record<string, string> = {
  timeout: "บอทไม่ตอบ ลองอีกครั้ง",
  "no-player": "ตอนนี้ยังไม่มีเพลงเล่นอยู่",
  "nothing-playing": "ตอนนี้ยังไม่มีเพลงเล่นอยู่",
  "not-found": "ไม่พบเพลงที่ค้นหา",
  "voice-channel-required": "เข้าห้องเสียงก่อน บอทจะเข้าห้องเดียวกับคุณ",
  unsupported: "ไม่รองรับลิงก์นี้",
  "coming-soon": "ยังไม่รองรับแหล่งเพลงนี้ จะรองรับเร็ว ๆ นี้",
  empty: "พิมพ์ชื่อเพลงหรือวางลิงก์ก่อน",
  "queue-too-short": "ต้องมีเพลงในคิวอย่างน้อยสองเพลงถึงจะสลับได้",
  forbidden: "คุณไม่ได้อยู่ในเซิร์ฟเวอร์นี้",
  unauthorized: "เซสชันหมดอายุ เข้าสู่ระบบใหม่อีกครั้ง",
  invalid: "คำสั่งไม่ถูกต้อง",
  "invalid-index": "ไม่พบเพลงนี้ในคิวแล้ว",
  stale: "คิวเปลี่ยนไประหว่างนั้น ลองอีกครั้ง",
  failed: "ทำไม่สำเร็จ ลองอีกครั้ง",
};

/** Adds a track or link to a Guild's queue from a browse page or the Search tab (#105). */
export async function playInGuild(guildId: string, query: string): Promise<{ ok: boolean; text: string | null }> {
  const ack = await sendCommand(guildId, { action: "play", query, next: false, voiceChannelId: null });
  return { ok: ack.ok, text: ack.ok ? null : (explain(ack) ?? ERROR_TH.failed ?? null) };
}

export function explain(ack: ControlAck): string | null {
  if (ack.ok) return null;
  if (ack.reason) return REASON_TH[ack.reason as ControlReason] ?? ack.reason;
  return ERROR_TH[ack.error ?? "failed"] ?? ERROR_TH.failed ?? null;
}
