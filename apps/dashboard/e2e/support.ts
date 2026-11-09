import { expect, type Page } from "@playwright/test";

/**
 * Signs in through the real popup flow (Supabase Auth → fake Discord) as whoever the fake Discord
 * was last set to, and waits until the account control shows `name`.
 */
export async function signInThroughPopup(page: Page, name: string): Promise<void> {
  await page.goto("/");
  const popup = page.waitForEvent("popup");
  await page.getByRole("banner").getByRole("button", { name: "เข้าสู่ระบบด้วย Discord" }).click();
  await (await popup).waitForEvent("close");
  await expect(page.getByTestId("account-name")).toHaveText(name);
}

/** A 1×1 PNG for Discord's CDN, so tests that show guild icons never reach the network. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

/** Serves every Discord CDN request with a tiny PNG; `missing` ids answer 404 instead. */
export async function stubDiscordCdn(page: Page, missing: string[] = []): Promise<void> {
  await page.route("https://cdn.discordapp.com/**", (route) =>
    missing.some((id) => route.request().url().includes(id))
      ? route.fulfill({ status: 404 })
      : route.fulfill({ contentType: "image/png", body: PNG }),
  );
}

/** The CDN URL the Backend builds for a guild icon (apps/backend/src/discord/discord-api.ts). */
export const guildIconUrl = (guildId: string, hash: string) =>
  `https://cdn.discordapp.com/icons/${guildId}/${hash}.png?size=96`;
