"use client";

import type { PlayerAction } from "@narze/shared";
import { SocketEvents } from "@narze/shared/channels";
import { getSocket } from "./socket";

/** The Backend's answer to a command (see apps/backend UserGateway `ControlAck`). */
export type ControlAck = { ok: true } | { ok: false; reason?: string; error?: string };

/** Sends one playback action for a Guild; the Backend decides Control Permission (#101). */
export async function sendCommand(guildId: string, command: PlayerAction): Promise<ControlAck> {
  const socket = await getSocket();
  try {
    return (await socket.timeout(7000).emitWithAck(SocketEvents.playerCommand, { guildId, command })) as ControlAck;
  } catch {
    return { ok: false, error: "timeout" };
  }
}

/** Thai meaning of each Control Permission reason (the v5 English strings are CONTROL_REASON_TEXT). */
export const REASON_TH: Record<string, string> = {
  "server-owner": "คุณเป็นเจ้าของเซิร์ฟเวอร์ สั่งได้จากทุกที่",
  "bot-owner": "คุณเป็นคนเชิญบอท สั่งได้จากทุกที่",
  "in-voice": "ยังไม่มีเพลง เริ่มเล่นได้เลย",
  "join-voice": "เข้าห้องเสียงก่อนถึงจะเริ่มเล่นได้",
  "in-bot-voice": "คุณอยู่ห้องเสียงเดียวกับบอท",
  "not-in-voice": "เข้าห้องเสียงก่อนถึงจะควบคุมบอทได้",
  "other-voice": "ต้องอยู่ห้องเสียงเดียวกับบอทถึงจะควบคุมได้",
};

/** Thai text for a failed command's error code. */
export const ERROR_TH: Record<string, string> = {
  timeout: "บอทไม่ตอบ ลองอีกครั้ง",
  "no-player": "ตอนนี้ยังไม่มีเพลงเล่นอยู่",
  "nothing-playing": "ตอนนี้ยังไม่มีเพลงเล่นอยู่",
  "not-found": "ไม่พบเพลงที่ค้นหา",
  unsupported: "ไม่รองรับลิงก์นี้",
  empty: "พิมพ์ชื่อเพลงหรือวางลิงก์ก่อน",
  "queue-too-short": "ต้องมีเพลงในคิวอย่างน้อยสองเพลงถึงจะสลับได้",
  forbidden: "คุณไม่ได้อยู่ในเซิร์ฟเวอร์นี้",
  unauthorized: "เซสชันหมดอายุ เข้าสู่ระบบใหม่อีกครั้ง",
  invalid: "คำสั่งไม่ถูกต้อง",
  failed: "ทำไม่สำเร็จ ลองอีกครั้ง",
};

export function explain(ack: ControlAck): string | null {
  if (ack.ok) return null;
  if (ack.reason) return REASON_TH[ack.reason] ?? ack.reason;
  return ERROR_TH[ack.error ?? "failed"] ?? ERROR_TH.failed ?? null;
}
