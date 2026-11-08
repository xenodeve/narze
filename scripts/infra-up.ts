/**
 * Starts the local infrastructure that `bun run verify` and `bun run e2e` need: Redis and Supabase
 * local (Postgres + Auth + REST). Unless the three Discord variables are already set in the shell,
 * Supabase Auth is pointed at the fake Discord (packages/fake-discord) so sign-in needs no real
 * credentials. See supabase/README.md.
 */
import { spawnSync } from "node:child_process";
import { FAKE_DISCORD_DOCKER_URL, FAKE_DISCORD_PORT } from "../packages/fake-discord/src/index";

const FAKE_DISCORD = {
  SUPABASE_AUTH_EXTERNAL_DISCORD_CLIENT_ID: "narze-fake-client",
  SUPABASE_AUTH_EXTERNAL_DISCORD_SECRET: "narze-fake-secret",
  SUPABASE_AUTH_EXTERNAL_DISCORD_URL: FAKE_DISCORD_DOCKER_URL,
};

const realDiscord = Object.keys(FAKE_DISCORD).every((name) => process.env[name]);
const env = realDiscord ? process.env : { ...process.env, ...FAKE_DISCORD };
console.log(`[infra] Supabase Auth → ${realDiscord ? "Discord from your shell environment" : `fake Discord on :${FAKE_DISCORD_PORT}`}`);

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: "inherit", env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("docker", ["compose", "up", "-d", "--wait", "redis"]);
// Only Auth, REST and Postgres are used; the rest would cost minutes of pulls and memory.
run(process.execPath, [
  "x",
  "supabase@3",
  "start",
  "-x",
  "studio,logflare,vector,imgproxy,edge-runtime,storage-api,realtime,mailpit,supavisor,postgres-meta",
]);
run(process.execPath, ["x", "supabase@3", "migration", "up"]);
