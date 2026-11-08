import { expect, type Page } from "@playwright/test";

/**
 * Signs in through the real popup flow (Supabase Auth → fake Discord) as whoever the fake Discord
 * was last set to, and waits until the account control shows `name`.
 */
export async function signInThroughPopup(page: Page, name: string): Promise<void> {
  await page.goto("/");
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "เข้าสู่ระบบด้วย Discord" }).click();
  await (await popup).waitForEvent("close");
  await expect(page.getByTestId("account-name")).toHaveText(name);
}
