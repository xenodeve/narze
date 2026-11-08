import { describe, expect, test } from "bun:test";
import {
  AdminQuerySchema,
  DiscordMessageSchema,
  fileTypeOf,
  RESTART_EXIT_CODE,
  SHUTDOWN_EXIT_CODE,
  startOfDayBangkok,
} from "../src/admin-discord";

describe("attachments are typed for the channel viewer (#111, spec #111)", () => {
  test("by content type first, then by extension; anything else is a file", () => {
    expect(fileTypeOf("image/png", "a.bin")).toBe("image");
    expect(fileTypeOf("video/mp4", "a")).toBe("video");
    expect(fileTypeOf("audio/ogg", "voice-message.ogg")).toBe("audio");
    expect(fileTypeOf(null, "photo.JPG")).toBe("image");
    expect(fileTypeOf(null, "clip.webm")).toBe("video");
    expect(fileTypeOf(null, "song.mp3")).toBe("audio");
    expect(fileTypeOf("application/pdf", "spec.pdf")).toBe("document");
    expect(fileTypeOf(null, "notes.txt")).toBe("document");
    expect(fileTypeOf(null, "archive.zip")).toBe("file");
  });
});

describe("a Discord message as the Dashboard reads it (#111)", () => {
  test("a message with every part parses; a reply and a thread are optional", () => {
    const message = {
      id: "1",
      content: "**hi** <@200000000000000001>",
      author: { id: "200000000000000002", name: "Dee", avatarUrl: null, bot: false },
      at: 1_700_000_000_000,
      editedAt: null,
      mentions: [{ id: "200000000000000001", name: "Kai" }],
      mentionedRoles: [{ id: "300000000000000001", name: "DJ", color: "#ff0000" }],
      attachments: [
        {
          id: "a",
          name: "cat.png",
          url: "https://cdn.discordapp.com/a/cat.png",
          size: 10,
          contentType: "image/png",
          fileType: "image",
          width: 10,
          height: 10,
          spoiler: false,
        },
      ],
      embeds: [
        {
          type: "rich",
          title: "T",
          description: null,
          url: null,
          color: "#5865f2",
          provider: null,
          author: null,
          thumbnail: null,
          image: null,
          video: null,
        },
      ],
      reactions: [{ emoji: "🔥", count: 2 }],
      replyTo: { messageId: "0", authorName: "Kai", content: "first" },
      thread: { id: "9", name: "talk", messageCount: 3, lastActivityAt: 1_700_000_000_000, archived: false },
    };
    expect(DiscordMessageSchema.parse(message).attachments[0]?.fileType).toBe("image");
    expect(DiscordMessageSchema.safeParse({ ...message, replyTo: null, thread: null }).success).toBe(true);
  });
});

describe("admin queries to the Bot (#111)", () => {
  test("each kind carries what it needs; messages ask for at most 50", () => {
    expect(AdminQuerySchema.safeParse({ id: "q1", kind: "guilds" }).success).toBe(true);
    expect(AdminQuerySchema.safeParse({ id: "q2", kind: "messages", guildId: "1", channelId: "2" }).success).toBe(true);
    expect(AdminQuerySchema.safeParse({ id: "q3", kind: "messages", guildId: "1" }).success).toBe(false);
    expect(AdminQuerySchema.safeParse({ id: "q4", kind: "restart", by: "200000000000000002" }).success).toBe(true);
    expect(AdminQuerySchema.safeParse({ id: "q5", kind: "format-disk" }).success).toBe(false);
  });

  test("restart and shutdown exit differently, so a process manager restarts only one of them", () => {
    expect(SHUTDOWN_EXIT_CODE).toBe(0);
    expect(RESTART_EXIT_CODE).not.toBe(0);
  });
});

describe("Active Today (#111, spec #114)", () => {
  test("a day starts at midnight in Bangkok (UTC+7), whatever the server's zone", () => {
    // 2026-11-08 01:30 in Bangkok is 2026-11-07 18:30 UTC.
    expect(startOfDayBangkok(Date.UTC(2026, 10, 7, 18, 30))).toBe(Date.UTC(2026, 10, 7, 17, 0));
    // 2026-11-08 23:59 in Bangkok is 16:59 UTC the same day.
    expect(startOfDayBangkok(Date.UTC(2026, 10, 8, 16, 59))).toBe(Date.UTC(2026, 10, 7, 17, 0));
    expect(startOfDayBangkok(Date.UTC(2026, 10, 8, 17, 0))).toBe(Date.UTC(2026, 10, 8, 17, 0));
  });
});
