import { describe, expect, test } from "bun:test";
import { type AnnounceFlags, nowPlayingNotice, recoveryNotice, shouldAnnounce } from "../src/music/announce";

const none: AnnounceFlags = {
  firstFromCommand: false,
  skipplay: false,
  skip: false,
  dontShow: false,
  terminal: false,
  trackLoop: false,
};

describe("Now-Playing Notice suppression (spec #15, #24)", () => {
  test("an ordinary next track is announced", () => {
    expect(shouldAnnounce(none, 0)).toBe(true);
  });

  test("the first track from /play with an empty queue is not (the reply already says it)", () => {
    expect(shouldAnnounce({ ...none, firstFromCommand: true }, 0)).toBe(false);
    expect(shouldAnnounce({ ...none, firstFromCommand: true }, 2)).toBe(true);
  });

  test("/skipplay and immediate plays (/playnext, /playat) are not", () => {
    expect(shouldAnnounce({ ...none, skipplay: true }, 0)).toBe(false);
    expect(shouldAnnounce({ ...none, dontShow: true }, 0)).toBe(false);
  });

  test("a track-loop repeat is not, unless /skip caused it", () => {
    expect(shouldAnnounce({ ...none, trackLoop: true }, 0)).toBe(false);
    expect(shouldAnnounce({ ...none, trackLoop: true, skip: true }, 0)).toBe(true);
  });

  test("terminal playback is never announced", () => {
    expect(shouldAnnounce({ ...none, terminal: true }, 0)).toBe(false);
  });
});

describe("Now-Playing Notice content (spec #23)", () => {
  test("title, length and requester, in the success colour, linking to the track", () => {
    const notice = nowPlayingNotice({
      uri: "https://music.youtube.com/watch?v=x",
      source: "youtubemusic",
      title: "Lemon",
      author: "Kenshi Yonezu",
      durationMs: 255_000,
      artworkUrl: "https://i.ytimg.com/vi/x/sddefault.jpg",
      requester: { id: "500000000000000001", name: "Dee", avatarUrl: null },
    });
    expect(notice).toEqual({
      color: 0xe4854a,
      author: {
        name: "Go to Page",
        url: "https://music.youtube.com/watch?v=x",
        iconUrl: "https://cdn.discordapp.com/embed/avatars/0.png",
      },
      description: "`▶️`┃**Lemon** ` 04:15 `\n> Requested by <@500000000000000001>",
      thumbnailUrl: "https://i.ytimg.com/vi/x/sddefault.jpg",
    });
  });
});

describe("Queue Recovery notice (#103)", () => {
  test("says what plays again, from where, and how much is queued; or that 24/7 rejoined", () => {
    const track = {
      uri: "https://music.youtube.com/watch?v=lemon",
      source: "youtubemusic" as const,
      title: "Lemon",
      author: "Kenshi Yonezu",
      durationMs: 255_000,
      artworkUrl: null,
      requester: { id: "1", name: "Dee", avatarUrl: null },
    };
    expect(recoveryNotice(track, 30_000, 2).description).toBe(
      "`🔄`┃**กู้คิวเพลงหลังบอทรีสตาร์ท** เล่นต่อ **Lemon** ` 00:30 ` · คิวอีก ` 2 ` เพลง",
    );
    expect(recoveryNotice(null, 0, 0).description).toBe("`🔄`┃**กู้คิวเพลงหลังบอทรีสตาร์ท** กลับเข้าห้องเสียงแล้ว (24/7)");
  });
});

describe("Now-Playing Notice for a playlist track (#104, spec #66)", () => {
  test("says which playlist it came from, as i/n", () => {
    const track = {
      uri: "https://music.youtube.com/watch?v=idol",
      source: "youtubemusic" as const,
      title: "Idol",
      author: "YOASOBI",
      durationMs: 213_000,
      artworkUrl: null,
      requester: { id: "1", name: "Dee", avatarUrl: null },
      playlist: { name: "Anime Hits", url: "https://x.test/p", index: 2, total: 3 },
    };
    expect(nowPlayingNotice(track).description).toBe(
      "`▶️`┃**Idol** ` 03:33 `\n> จาก: Anime Hits (2/3)\n> Requested by <@1>",
    );
  });
});

test("a playlist name in the notice is escaped (#104 review)", () => {
  const track = {
    uri: "u",
    source: "youtubemusic" as const,
    title: "t",
    author: "a",
    durationMs: 1000,
    artworkUrl: null,
    requester: { id: "1", name: "Dee", avatarUrl: null },
    playlist: { name: "*bold*", url: "p", index: 1, total: 1 },
  };
  const description = nowPlayingNotice(track).description ?? "";
  expect(description).toContain(String.raw`\*bold\* (1/1)`);
  expect(description).not.toContain(" *bold* ");
});
