import { afterAll, describe, expect, test } from "bun:test";
import { localSupabase } from "@narze/fake-discord/supabase-local";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseSettingsStore } from "../src/settings/guild-settings";

const G = "925000000000000001";
const { url, secretKey } = localSupabase();
const db = createClient(url, secretKey, { auth: { persistSession: false } });
const store = createSupabaseSettingsStore(db);

afterAll(async () => {
  await db.from("guild_settings").delete().eq("guild_id", G);
});

describe("Guild Settings in Supabase, as the Bot writes them (#106, spec #22, #121)", () => {
  test("a re-invite keeps the first Bot Owner, the Music Channel and the outfit (#106 review)", async () => {
    await db.from("guild_settings").delete().eq("guild_id", G);
    await store.ensure({ guildId: G, guildName: "Club", ownerId: "1" });
    await store.setMusicChannel(G, "55");
    await db
      .from("guild_settings")
      .update({ avatar: { type: "cat" } })
      .eq("guild_id", G);

    await store.ensure({ guildId: G, guildName: "Club 2", ownerId: "2" });
    expect(await store.get(G)).toMatchObject({
      guildName: "Club 2",
      // Anyone with Manage Server could otherwise kick and re-add the Bot to become its owner.
      ownerId: "1",
      musicChannelId: "55",
      avatar: { type: "cat", hat: "none" },
    });
  });
});
