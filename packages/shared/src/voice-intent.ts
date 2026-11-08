import type { PlayerAction } from "./commands";

/**
 * Voice Commands (#113): what an utterance means, as the same PlayerActions the buttons send. A
 * small grammar, not a language model: anything outside it is "unknown" and says what was heard.
 */
export type VoiceIntent = { kind: "action"; action: PlayerAction } | { kind: "unknown"; text: string };

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
const toArabic = (text: string) => text.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)));

const THAI_UNITS: Array<[string, number]> = [
  ["ศูนย์", 0],
  ["หนึ่ง", 1],
  ["เอ็ด", 1],
  ["สอง", 2],
  ["ยี่", 2],
  ["สาม", 3],
  ["สี่", 4],
  ["ห้า", 5],
  ["หก", 6],
  ["เจ็ด", 7],
  ["แปด", 8],
  ["เก้า", 9],
];

/** สี่สิบห้า → 45, ร้อยห้าสิบ → 150, สิบเอ็ด → 11. The whole text must be number words. */
function thaiNumber(text: string): number | null {
  let rest = text.replace(/\s+/g, "");
  if (!rest) return null;
  let total = 0;
  let digit: number | null = null;
  while (rest) {
    const unit = THAI_UNITS.find(([word]) => rest.startsWith(word));
    if (unit) {
      digit = unit[1];
      rest = rest.slice(unit[0].length);
    } else if (rest.startsWith("สิบ")) {
      total += (digit ?? 1) * 10;
      digit = null;
      rest = rest.slice(3);
    } else if (rest.startsWith("ร้อย")) {
      total += (digit ?? 1) * 100;
      digit = null;
      rest = rest.slice(4);
    } else {
      return null;
    }
  }
  return total + (digit ?? 0);
}

const ENGLISH: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/** "forty five", "forty-five", "a hundred", "one hundred and twenty". */
function englishNumber(text: string): number | null {
  const words = text.toLowerCase().replace(/-/g, " ").split(/\s+/).filter(Boolean);
  let current = 0;
  let seen = false;
  for (const word of words) {
    if (word === "and" || word === "a") continue;
    if (word === "hundred") {
      current = (current || 1) * 100;
      seen = true;
    } else if (word in ENGLISH) {
      current += ENGLISH[word] as number;
      seen = true;
    } else {
      return null;
    }
  }
  return seen ? current : null;
}

/** A spoken number: digits (Arabic or Thai), Thai number words, or English number words. */
export function parseNumber(text: string): number | null {
  const plain = toArabic(text.trim());
  if (!plain) return null;
  if (/^\d+$/.test(plain)) return Number(plain);
  return thaiNumber(plain) ?? englishNumber(plain);
}

/** Politeness and filler around a command: "ข้ามเพลงครับ", "please skip". */
const TRAILING = /\s*(ครับ|ค่ะ|คะ|นะ|หน่อย|ด้วย|จ้า|please)$/;
const LEADING = /^(ช่วย|please|ok|okay|hey)\s*/;
function normalize(text: string): string {
  let out = toArabic(text.trim().toLowerCase().replace(/\s+/g, " "));
  for (let changed = true; changed; ) {
    const next = out.replace(TRAILING, "").replace(LEADING, "").trim();
    changed = next !== out;
    out = next;
  }
  return out;
}

const RULES: Array<[RegExp, (m: RegExpExecArray) => PlayerAction | null]> = [
  [/^(เลิกวน|ปิดวน|ไม่วน|หยุดวน|loop off|stop looping|no loop|repeat off)$/, () => ({ action: "loop", mode: "off" })],
  [/^(วนเพลงนี้|วนเพลง|วนเพลงเดียว|(loop|repeat)( this| the)? (song|track))$/, () => ({ action: "loop", mode: "track" })],
  [/^(วนทั้งคิว|วนคิว|วนทั้งหมด|(loop|repeat)( the)? queue|repeat all)$/, () => ({ action: "loop", mode: "queue" })],
  [/^(วน|loop|repeat)$/, () => ({ action: "loop", mode: null })],
  [/^(สุ่ม|สุ่มเพลง|สุ่มคิว|สลับ|สลับเพลง|shuffle( the queue)?)$/, () => ({ action: "shuffle" })],
  [
    /^(?:ปรับ)?(?:ระดับ)?(?:เสียง|ความดัง)(?:เป็น|ที่)?\s*(.*)$/,
    (m) => {
      const volume = parseNumber(m[1] ?? "");
      return volume === null ? null : { action: "volume", volume: Math.min(volume, 1000) };
    },
  ],
  [
    /^(?:set )?volume(?: to)?\s*(.*)$/,
    (m) => {
      const volume = parseNumber(m[1] ?? "");
      return volume === null ? null : { action: "volume", volume: Math.min(volume, 1000) };
    },
  ],
  [/^(เล่นต่อ|ต่อ|เล่น|resume|continue|unpause|play)$/, () => ({ action: "resume" })],
  [/^(หยุด|หยุดชั่วคราว|หยุดก่อน|หยุดเพลง|พัก|พักเพลง|พักเพลงก่อน|pause|stop)$/, () => ({ action: "pause" })],
  [/^(ข้าม|ข้ามเพลง|เพลงถัดไป|ถัดไป|skip|skip (this )?song|next|next song)$/, () => ({ action: "skip" })],
  [/^(ย้อน|ย้อนกลับ|ย้อนเพลง|เพลงก่อนหน้า|ก่อนหน้า|previous|previous song|back|go back)$/, () => ({ action: "previous" })],
  [
    /^(?:เล่นเพลง|เปิดเพลง|เล่น|เปิด)\s*(.+)$/,
    (m) => ({ action: "play", query: (m[1] ?? "").trim(), next: false, voiceChannelId: null }),
  ],
  [
    /^play(?: the song| song)?\s+(.+)$/,
    (m) => ({ action: "play", query: (m[1] ?? "").trim(), next: false, voiceChannelId: null }),
  ],
];

export function parseIntent(heard: string): VoiceIntent {
  const text = normalize(heard);
  for (const [pattern, toAction] of RULES) {
    const match = pattern.exec(text);
    if (!match) continue;
    const action = toAction(match);
    if (action) return { kind: "action", action };
    break;
  }
  return { kind: "unknown", text: heard.trim() };
}
