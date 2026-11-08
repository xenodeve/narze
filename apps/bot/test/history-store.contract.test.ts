import { afterAll, describe, expect, test } from "bun:test";
import { localSupabase } from "@narze/fake-discord/supabase-local";
import { type ListeningSession, trackKey } from "@narze/shared";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseHistoryStore } from "../src/history/history-store";

const G = "926000000000000001";
const OTHER = "926000000000000002";
const U = "126000000000000001";
const { url, secretKey } = localSupabase();
const db = createClient(url, secretKey, { auth: { persistSession: false } });
const store = createSupabaseHistoryStore(db);
const requester = { id: U, name: "Uma", avatarUrl: null };

const session = (guildId: string, id: string): ListeningSession => ({
  id,
  guildId,
  guildName: "Club",
  channelId: "926000000000000093",
  startTime: 1_000,
  endTime: null,
  isActive: true,
  tracks: [
    {
      title: "Idol",
      author: "YOASOBI",
      uri: "https://x.test/i",
      thumbnail: null,
      durationMs: 1,
      playedAt: 1_000,
      requester,
    },
  ],
  participants: [{ ...requester, joinedAt: 1_000 }],
});

afterAll(async () => {
  await db.from("listening_sessions").delete().in("guild_id", [G, OTHER]);
  await db.from("play_history").delete().in("discord_id", [U]);
  await db.from("play_history").delete().in("guild_id", [G]);
});

describe("Listening Sessions in Supabase, as the Bot writes them (#108)", () => {
  test("a save is an upsert by id, with who took part searchable", async () => {
    await store.save(session(G, `${G}-1`));
    await store.save({ ...session(G, `${G}-1`), guildName: "Club 2" });
    const { data } = await db
      .from("listening_sessions")
      .select("guild_name, participant_ids, track_count")
      .eq("id", `${G}-1`);
    expect(data).toEqual([{ guild_name: "Club 2", participant_ids: [U], track_count: 1 }]);
  });

  test("closing on restart ends this Bot's Guilds' active rows only, with the restart time", async () => {
    await store.save(session(OTHER, `${OTHER}-1`));
    await store.closeActive(9_000, [G]);
    const { data } = await db
      .from("listening_sessions")
      .select("id, is_active, end_time")
      .in("guild_id", [G, OTHER])
      .order("id");
    expect(data).toEqual([
      { id: `${G}-1`, is_active: false, end_time: 9_000 },
      { id: `${OTHER}-1`, is_active: true, end_time: null },
    ]);
  });
});

describe("Play History in Supabase (#108, spec #33)", () => {
  test("a play bumps the guild-user, user and guild rows together", async () => {
    const play = {
      trackId: trackKey("Idol", "YOASOBI"),
      title: "Idol",
      artist: "YOASOBI",
      uri: "https://x.test/i",
      thumbnail: null,
      durationMs: 1,
      source: "youtube",
      isMusic: true,
      isVideo: false,
    };
    await store.recordPlay(G, U, play);
    await store.recordPlay(G, U, play);
    const { data } = await db
      .from("play_history")
      .select("guild_id, discord_id, play_count")
      .eq("track_id", play.trackId)
      .or(`discord_id.eq.${U},guild_id.eq.${G}`)
      .order("guild_id")
      .order("discord_id");
    expect(data).toEqual([
      { guild_id: "", discord_id: U, play_count: 2 },
      { guild_id: G, discord_id: "", play_count: 2 },
      { guild_id: G, discord_id: U, play_count: 2 },
    ]);
  });
});
