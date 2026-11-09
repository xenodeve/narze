import { describe, expect, test } from "bun:test";
import { SOUNDCLOUD_PLAYABLE, SourcesSchema } from "../src/sources";

describe("which sources can play (#157)", () => {
  test("the Backend's answer has a flag per source", () => {
    expect(SourcesSchema.parse({ spotify: false, soundcloud: false })).toEqual({ spotify: false, soundcloud: false });
    expect(SourcesSchema.safeParse({ spotify: "yes" }).success).toBe(false);
  });

  test("SoundCloud stays off until lavaplayer plays its HLS streams (#156)", () => {
    expect(SOUNDCLOUD_PLAYABLE).toBe(false);
  });
});
