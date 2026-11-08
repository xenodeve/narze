import { describe, expect, test } from "bun:test";
import { type AnnounceFlags, nowPlayingNotice, shouldAnnounce } from "../src/music/announce";

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
