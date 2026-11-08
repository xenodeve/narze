import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type FakeDiscord, startFakeDiscord } from "../src";

let discord: FakeDiscord;
const base = () => `http://127.0.0.1:${discord.port}`;
const alice = { id: "111111111111111111", username: "alice", globalName: "Alice" };
const guilds = [{ id: "900000000000000001", name: "Home", icon: null, owner: true }];

beforeAll(async () => {
  discord = await startFakeDiscord({ hostname: "127.0.0.1" });
});
afterAll(() => discord.stop());

async function signIn(): Promise<string> {
  const authorize = await fetch(
    `${base()}/api/oauth2/authorize?redirect_uri=${encodeURIComponent("http://cb.test/callback")}&state=s-1`,
    { redirect: "manual" },
  );
  expect(authorize.status).toBe(302);
  const back = new URL(authorize.headers.get("location") ?? "");
  expect(back.origin + back.pathname).toBe("http://cb.test/callback");
  expect(back.searchParams.get("state")).toBe("s-1");
  const token = await fetch(`${base()}/api/oauth2/token`, {
    method: "POST",
    body: new URLSearchParams({ grant_type: "authorization_code", code: back.searchParams.get("code") ?? "" }),
  });
  expect(token.status).toBe(200);
  return ((await token.json()) as { access_token: string }).access_token;
}

describe("fake Discord OAuth (the stubbed provider for Supabase Auth)", () => {
  test("signs in as the user set through the control endpoint, with that user's guilds", async () => {
    await fetch(`${base()}/__fake/user`, { method: "POST", body: JSON.stringify({ user: alice, guilds }) });
    const token = await signIn();
    const me = await fetch(`${base()}/api/users/@me`, { headers: { authorization: `Bearer ${token}` } });
    expect(await me.json()).toMatchObject({ id: alice.id, username: "alice", discriminator: "0", verified: true });
    const list = await fetch(`${base()}/api/v10/users/@me/guilds`, { headers: { authorization: `Bearer ${token}` } });
    expect(await list.json()).toEqual(guilds);
  });

  test("an unknown token is refused", async () => {
    const me = await fetch(`${base()}/api/v10/users/@me`, { headers: { authorization: "Bearer nope" } });
    expect(me.status).toBe(401);
  });

  test("a code can be exchanged only once", async () => {
    const authorize = await fetch(`${base()}/api/oauth2/authorize?redirect_uri=http%3A%2F%2Fcb.test%2F&state=s`, {
      redirect: "manual",
    });
    const code = new URL(authorize.headers.get("location") ?? "").searchParams.get("code") ?? "";
    const exchange = () => fetch(`${base()}/api/oauth2/token`, { method: "POST", body: new URLSearchParams({ code }) });
    expect((await exchange()).status).toBe(200);
    expect((await exchange()).status).toBe(400);
  });
});
