import { type ChildProcess, spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { BUN } from "./bun-bin";

const BOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../bot");

/** Starts the real Bot process (no Discord token: heartbeat-only Connected Mode). */
function startBot(): ChildProcess {
  const bot = spawn(BUN, ["src/main.ts"], {
    cwd: BOT_DIR,
    env: { ...process.env, DISCORD_TOKEN: "", DISCORD_CLIENT_ID: "1100000000000000077" },
    stdio: "ignore",
  });
  // Surface a spawn failure (e.g. a POSIX-style BUN_BIN on Windows) instead of a silent timeout.
  bot.on("error", (error) => {
    throw new Error(`could not start the Bot with ${BUN}: ${error.message}`);
  });
  return bot;
}

function stopBot(bot: ChildProcess): Promise<void> {
  return new Promise((done) => {
    // A process killed by a signal has exitCode null and signalCode set; both mean it is gone.
    if (bot.exitCode !== null || bot.signalCode !== null) return done();
    bot.once("exit", () => done());
    bot.kill("SIGKILL");
  });
}

test.describe("Bot status on the landing page", () => {
  let bot: ChildProcess | undefined;
  test.afterEach(async () => {
    if (bot) await stopBot(bot);
    bot = undefined;
  });

  test("stopping the Bot flips the page and the avatar to offline within 5 s, and starting it flips back", async ({
    page,
  }) => {
    await page.goto("/");
    const status = page.getByRole("status", { name: "สถานะบอท" });
    // The avatar's own canvas carries role="img" and a per-state label ("<shape> bot, <state>").
    const avatar = page.locator('canvas[role="img"]');
    await expect(status).toContainText("ออฟไลน์");

    bot = startBot();
    await expect(status).toContainText("ออนไลน์", { timeout: 10_000 });
    await expect(avatar).toHaveAttribute("aria-label", /, idle$/);
    await expect(page.getByText("0 เซิร์ฟเวอร์")).toBeVisible();

    await stopBot(bot);
    // #98's criterion, measured from the moment the Bot process is gone.
    await expect(status).toContainText("ออฟไลน์", { timeout: 5_000 });
    await expect(avatar).toHaveAttribute("aria-label", /, sleeping$/);

    bot = startBot();
    await expect(status).toContainText("ออนไลน์", { timeout: 10_000 });
  });

  test("renders without horizontal overflow at 390 px in both themes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow in ${scheme}`).toBe(0);
    }
  });
});
