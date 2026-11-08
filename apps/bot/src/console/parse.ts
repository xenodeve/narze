/**
 * The operator console's words (#112, spec #119). Arguments are split like a shell: quotes keep a
 * phrase together, so a song name with spaces is written in quotes instead of v5's digit guessing.
 */

export type ConsoleCommand =
  | { kind: "empty" }
  | { kind: "play"; query: string; guild: string; voice: string; text: string | null }
  | { kind: "stop" | "skip" | "leave"; guild: string }
  | { kind: "status"; guild: string | null }
  | { kind: "list" }
  | { kind: "find"; what: "guild"; name: string }
  | { kind: "find"; what: "voice" | "text"; guild: string; name: string }
  | { kind: "help" }
  | { kind: "clear" }
  | { kind: "exit" }
  | { kind: "usage"; command: string; message: string }
  | { kind: "unknown"; word: string };

export const USAGE = {
  play: 'play <เพลง> <เซิร์ฟเวอร์> <ห้องเสียง> [ช่องข้อความ]   ชื่อที่มีเว้นวรรคให้ใส่ "เครื่องหมายคำพูด"',
  stop: "stop <เซิร์ฟเวอร์>",
  skip: "skip <เซิร์ฟเวอร์>",
  leave: "leave <เซิร์ฟเวอร์>",
  status: "status [เซิร์ฟเวอร์]",
  find: "find guild <ชื่อ> | find voice <เซิร์ฟเวอร์> <ชื่อ> | find text <เซิร์ฟเวอร์> <ชื่อ>",
} as const;

/** Splits a line like a shell: "double" or 'single' quotes, and \ escapes inside or outside them. */
export function tokenize(line: string): string[] | null {
  const tokens: string[] = [];
  let current: string | null = null;
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i] as string;
    if (c === "\\" && i + 1 < line.length) {
      current = (current ?? "") + line[++i];
    } else if (quote) {
      if (c === quote) quote = null;
      else current = (current ?? "") + c;
    } else if ((c === '"' || c === "'") && current === null) {
      // Only at the start of a word: rock'n'roll and don't are names, not quotes.
      quote = c;
      current = "";
    } else if (/\s/.test(c)) {
      if (current !== null) tokens.push(current);
      current = null;
    } else {
      current = (current ?? "") + c;
    }
  }
  if (quote) return null;
  if (current !== null) tokens.push(current);
  return tokens;
}

const usage = (command: keyof typeof USAGE): ConsoleCommand => ({ kind: "usage", command, message: USAGE[command] });

export function parseCommand(line: string): ConsoleCommand {
  const tokens = tokenize(line);
  if (tokens === null)
    return { kind: "usage", command: "quote", message: 'ปิดเครื่องหมายคำพูดให้ครบ เช่น play "ชื่อเพลง" ...' };
  const [first, ...args] = tokens;
  if (first === undefined) return { kind: "empty" };
  const word = first.toLowerCase();
  switch (word) {
    case "play": {
      if (args.length < 3 || args.length > 4) return usage("play");
      const [query, guild, voice, text] = args as [string, string, string, string?];
      return { kind: "play", query, guild, voice, text: text ?? null };
    }
    case "stop":
    case "skip":
    case "leave":
      return args.length === 1 ? { kind: word, guild: args[0] as string } : usage(word);
    case "status":
      return args.length <= 1 ? { kind: "status", guild: args[0] ?? null } : usage("status");
    case "list":
    case "guilds":
      return { kind: "list" };
    case "find": {
      const [what, a, b] = args;
      if (what === "guild" && a !== undefined && b === undefined) return { kind: "find", what, name: a };
      if ((what === "voice" || what === "text") && a !== undefined && b !== undefined && args.length === 3)
        return { kind: "find", what, guild: a, name: b };
      return usage("find");
    }
    case "help":
      return { kind: "help" };
    case "clear":
    case "cls":
      return { kind: "clear" };
    case "exit":
    case "quit":
      return { kind: "exit" };
    default:
      return { kind: "unknown", word: first };
  }
}
