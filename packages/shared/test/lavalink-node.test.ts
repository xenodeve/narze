import { describe, expect, test } from "bun:test";
import { lavalinkNode } from "../src/lavalink-node";

describe("lavalinkNode (#150)", () => {
  test("unset or empty values take docker compose's defaults", () => {
    const defaults = { host: "127.0.0.1", port: 2333, password: "youshallnotpass" };
    expect(lavalinkNode({})).toEqual(defaults);
    // `.env.example` ships `LAVALINK_PASSWORD=`: empty must not reach Lavalink as the password.
    expect(lavalinkNode({ LAVALINK_HOST: "", LAVALINK_PORT: "", LAVALINK_PASSWORD: "" })).toEqual(defaults);
  });

  test("set values are used as given", () => {
    expect(lavalinkNode({ LAVALINK_HOST: "lavalink", LAVALINK_PORT: "2444", LAVALINK_PASSWORD: "s3cret" })).toEqual({
      host: "lavalink",
      port: 2444,
      password: "s3cret",
    });
  });
});
