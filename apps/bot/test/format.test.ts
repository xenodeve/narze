import { describe, expect, test } from "bun:test";
import { trackLink } from "../src/music/format";

describe("track links in Discord markdown (#102)", () => {
  test("a title cannot break out of the link or add formatting", () => {
    expect(trackLink({ title: "a](https://evil.test) **b**", uri: "https://x.test/v" })).toBe(
      "[a\\]\\(https://evil.test\\) \\*\\*b\\*\\*](https://x.test/v)",
    );
  });

  test("a uri cannot end the link early", () => {
    expect(trackLink({ title: "t", uri: "https://x.test/a b)(c" })).toBe("[t](https://x.test/a%20b%29%28c)");
  });

  test("a long title is cut so the description stays inside Discord's limit", () => {
    expect(trackLink({ title: "x".repeat(200), uri: "u" }, 10)).toBe(`[${"x".repeat(9)}…](u)`);
  });
});
