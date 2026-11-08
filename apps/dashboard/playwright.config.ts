import { FAKE_DISCORD_PORT, localSupabase } from "@narze/fake-discord/supabase-local";
import { defineConfig, devices } from "@playwright/test";
import { BUN } from "./e2e/bun-bin";

const BACKEND_PORT = 4100;
const DASHBOARD_PORT = 3100;
// Keys come from the running Supabase local (bun run infra:up), never from the repo.
const supabase = localSupabase();

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${DASHBOARD_PORT}`,
    trace: "retain-on-failure",
    launchOptions: {
      // Supabase Auth (in Docker) sends the browser to the fake Discord as host.docker.internal,
      // which this machine's firewall does not route back to itself; loopback reaches it.
      args: ["--host-resolver-rules=MAP host.docker.internal 127.0.0.1"],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `${BUN} src/main.ts`,
      cwd: "../../packages/fake-discord",
      port: FAKE_DISCORD_PORT,
      env: { FAKE_DISCORD_PORT: String(FAKE_DISCORD_PORT) },
      reuseExistingServer: false,
    },
    {
      // Catalog search's outside world (#105): Fake Lavalink :4610 and a fake Spotify Web API :4611.
      command: `${BUN} e2e/fake-catalog.ts`,
      port: 4611,
      reuseExistingServer: false,
    },
    {
      // Run from the backend folder: Bun picks the tsconfig from the working directory, and the
      // backend's legacy-decorator settings (Nest) only apply when started there.
      command: `${BUN} src/main.ts`,
      cwd: "../backend",
      port: BACKEND_PORT,
      env: {
        BACKEND_PORT: String(BACKEND_PORT),
        DASHBOARD_ORIGIN: `http://localhost:${DASHBOARD_PORT}`,
        SUPABASE_URL: supabase.url,
        SUPABASE_SECRET_KEY: supabase.secretKey,
        DISCORD_API_URL: `http://127.0.0.1:${FAKE_DISCORD_PORT}/api/v10`,
        LAVALINK_HOST: "127.0.0.1",
        LAVALINK_PORT: "4610",
        LAVALINK_PASSWORD: "e2e",
        SPOTIFY_CLIENT_ID: "e2e",
        SPOTIFY_CLIENT_SECRET: "e2e",
        SPOTIFY_API_URL: "http://127.0.0.1:4611/v1",
        SPOTIFY_ACCOUNTS_URL: "http://127.0.0.1:4611",
        // Charts (#109) from the fake feed, under their own keys: a dev Backend's real copy is untouched.
        CHARTS_URL: "http://127.0.0.1:4611/charts",
        CHARTS_KEY_PREFIX: "e2e:",
      },
      // Never reuse: in no-CI mode the T4 gate runs e2e locally, and a stale server on this port
      // would test old code (#116).
      reuseExistingServer: false,
    },
    {
      command: `${BUN} run build && ${BUN} run start -- -p ${DASHBOARD_PORT}`,
      port: DASHBOARD_PORT,
      env: {
        NEXT_PUBLIC_BACKEND_URL: `http://localhost:${BACKEND_PORT}`,
        NEXT_PUBLIC_SUPABASE_URL: supabase.url,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabase.publishableKey,
      },
      timeout: 240_000,
      // Never reuse: in no-CI mode the T4 gate runs e2e locally, and a stale server on this port
      // would test old code (#116).
      reuseExistingServer: false,
    },
  ],
});
