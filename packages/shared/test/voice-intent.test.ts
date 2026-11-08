import { describe, expect, test } from "bun:test";
import { parseIntent, parseNumber } from "../src/voice-intent";

const action = (text: string): unknown => {
  const intent = parseIntent(text);
  return intent.kind === "action" ? intent.action : null;
};

describe("numbers said aloud (#113)", () => {
  test("digits, Thai digits, Thai words and English words", () => {
    expect(parseNumber("40")).toBe(40);
    expect(parseNumber("๔๐")).toBe(40);
    expect(parseNumber("สี่สิบ")).toBe(40);
    expect(parseNumber("สี่สิบห้า")).toBe(45);
    expect(parseNumber("ยี่สิบเอ็ด")).toBe(21);
    expect(parseNumber("สิบ")).toBe(10);
    expect(parseNumber("สิบเอ็ด")).toBe(11);
    expect(parseNumber("หนึ่งร้อย")).toBe(100);
    expect(parseNumber("ร้อยห้าสิบ")).toBe(150);
    expect(parseNumber("ศูนย์")).toBe(0);
    expect(parseNumber("forty")).toBe(40);
    expect(parseNumber("forty five")).toBe(45);
    expect(parseNumber("forty-five")).toBe(45);
    expect(parseNumber("a hundred")).toBe(100);
    expect(parseNumber("one hundred and twenty")).toBe(120);
    expect(parseNumber("zero")).toBe(0);
    expect(parseNumber("loud")).toBeNull();
    expect(parseNumber("")).toBeNull();
  });
});

describe("what a spoken command means (#113, the same actions as the buttons)", () => {
  test("play a song, in Thai (with or without a space) and English", () => {
    const play = (query: string) => ({ action: "play", query, next: false, voiceChannelId: null });
    expect(action("เล่นเพลง ไอดอล")).toEqual(play("ไอดอล"));
    expect(action("เล่นเพลงไอดอล")).toEqual(play("ไอดอล"));
    expect(action("เปิดเพลง yoasobi idol ครับ")).toEqual(play("yoasobi idol"));
    expect(action("Play Idol by YOASOBI")).toEqual(play("Idol by YOASOBI"));
    expect(action("play the song lemon")).toEqual(play("lemon"));
  });

  test("skip, previous, pause and resume", () => {
    for (const text of ["ข้าม", "ข้ามเพลง", "เพลงถัดไป", "ถัดไปครับ", "skip", "Next song"]) {
      expect(action(text)).toEqual({ action: "skip" });
    }
    for (const text of ["ย้อน", "ย้อนกลับ", "เพลงก่อนหน้า", "previous", "go back"]) {
      expect(action(text)).toEqual({ action: "previous" });
    }
    for (const text of ["หยุด", "หยุดชั่วคราว", "พักเพลงก่อน", "pause", "stop"]) {
      expect(action(text)).toEqual({ action: "pause" });
    }
    for (const text of ["เล่นต่อ", "เล่นต่อนะ", "resume", "continue", "play", "เล่น"]) {
      expect(action(text)).toEqual({ action: "resume" });
    }
  });

  test("volume with digits and words, Thai and English", () => {
    const volume = (n: number) => ({ action: "volume", volume: n });
    expect(action("เสียง 40")).toEqual(volume(40));
    expect(action("เสียงสี่สิบ")).toEqual(volume(40));
    expect(action("ปรับเสียงเป็นห้าสิบ")).toEqual(volume(50));
    expect(action("ความดัง ๘๐")).toEqual(volume(80));
    expect(action("volume 30")).toEqual(volume(30));
    expect(action("set volume to forty five")).toEqual(volume(45));
    expect(action("volume one hundred")).toEqual(volume(100));
    // No number: the volume is unchanged rather than guessed.
    expect(parseIntent("เสียง")).toEqual({ kind: "unknown", text: "เสียง" });
  });

  test("loop modes and shuffle", () => {
    const loop = (mode: "off" | "track" | "queue" | null) => ({ action: "loop", mode });
    expect(action("วน")).toEqual(loop(null));
    expect(action("loop")).toEqual(loop(null));
    expect(action("วนเพลงนี้")).toEqual(loop("track"));
    expect(action("repeat this song")).toEqual(loop("track"));
    expect(action("วนทั้งคิว")).toEqual(loop("queue"));
    expect(action("loop the queue")).toEqual(loop("queue"));
    expect(action("เลิกวน")).toEqual(loop("off"));
    expect(action("loop off")).toEqual(loop("off"));
    expect(action("สุ่มเพลง")).toEqual({ action: "shuffle" });
    expect(action("shuffle")).toEqual({ action: "shuffle" });
  });

  test("a command word after เล่น / เปิด is that command, not a song to play", () => {
    expect(action("เปิดวน")).toEqual({ action: "loop", mode: null });
    expect(action("เปิดสุ่ม")).toEqual({ action: "shuffle" });
    expect(action("เล่นเพลงต่อ")).toEqual({ action: "resume" });
    expect(action("เปิดเพลงต่อ")).toEqual({ action: "resume" });
    // A real title still plays.
    expect(action("เปิดเพลงต่อไป")).toEqual({ action: "play", query: "ต่อไป", next: false, voiceChannelId: null });
  });

  test("what Thai and browser recognizers really send (scrutinize #113)", () => {
    // "เล่นเพลง" alone is "play", not a search for the word เพลง.
    expect(action("เล่นเพลง")).toEqual({ action: "resume" });
    expect(action("เปิดเพลงครับ")).toEqual({ action: "resume" });
    // Thai with spaces between words, trailing punctuation, percent.
    expect(action("ข้าม เพลง")).toEqual({ action: "skip" });
    expect(action("หยุด ชั่วคราว")).toEqual({ action: "pause" });
    expect(action("วน ทั้งคิว")).toEqual({ action: "loop", mode: "queue" });
    expect(action("Skip.")).toEqual({ action: "skip" });
    expect(action("ข้าม!")).toEqual({ action: "skip" });
    expect(action("เสียง 40%")).toEqual({ action: "volume", volume: 40 });
    expect(action("volume 10 percent")).toEqual({ action: "volume", volume: 10 });
    expect(action("เสียงห้าสิบเปอร์เซ็นต์")).toEqual({ action: "volume", volume: 50 });
    expect(action("okay skip")).toEqual({ action: "skip" });
    // Voice never goes louder than the slider (100): "สี่ร้อย" is easily misheard for "สี่สิบ".
    expect(action("เสียง 400")).toEqual({ action: "volume", volume: 100 });
    // An ending that belongs to a title stays; a link keeps its case.
    expect(action("เล่นเพลง คิดถึงนะ")).toEqual({ action: "play", query: "คิดถึงนะ", next: false, voiceChannelId: null });
    expect(action("play https://youtu.be/AbCdEf")).toEqual({
      action: "play",
      query: "https://youtu.be/AbCdEf",
      next: false,
      voiceChannelId: null,
    });
    // Two digits in a row are not a number.
    expect(parseNumber("สองสาม")).toBeNull();
    expect(parseIntent("")).toEqual({ kind: "unknown", text: "" });
  });

  test("anything else is unknown, and says what was heard", () => {
    expect(parseIntent("ทำกับข้าวให้หน่อย")).toEqual({ kind: "unknown", text: "ทำกับข้าวให้หน่อย" });
    expect(parseIntent("   ")).toEqual({ kind: "unknown", text: "" });
  });
});
