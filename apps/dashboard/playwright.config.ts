import { defineConfig, devices } from "@playwright/test";
import { BUN } from "./e2e/bun-bin";

const BACKEND_PORT = 4100;
const DASHBOARD_PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: `http://localhost:${DASHBOARD_PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Run from the backend folder: Bun picks the tsconfig from the working directory, and the
      // backend's legacy-decorator settings (Nest) only apply when started there.
      command: `${BUN} src/main.ts`,
      cwd: "../backend",
      port: BACKEND_PORT,
      env: { BACKEND_PORT: String(BACKEND_PORT), DASHBOARD_ORIGIN: `http://localhost:${DASHBOARD_PORT}` },
      // Never reuse: in no-CI mode the T4 gate runs e2e locally, and a stale server on this port
      // would test old code (#116).
      reuseExistingServer: false,
    },
    {
      command: `${BUN} run build && ${BUN} run start -- -p ${DASHBOARD_PORT}`,
      port: DASHBOARD_PORT,
      env: { NEXT_PUBLIC_BACKEND_URL: `http://localhost:${BACKEND_PORT}` },
      timeout: 240_000,
      // Never reuse: in no-CI mode the T4 gate runs e2e locally, and a stale server on this port
      // would test old code (#116).
      reuseExistingServer: false,
    },
  ],
});
