"use client";

import {
  type GuildSettings,
  GuildSettingsSchema,
  type SettingsUpdate,
  type SettingsView,
  SettingsViewSchema,
  SocketEvents,
} from "@narze/shared";
import { useEffect, useState } from "react";
import { apiGet } from "./api";
import { BACKEND_URL } from "./config";
import { currentAccessToken } from "./session";
import { onSocketEvents } from "./socket";

export type SettingsState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "failed" }
  | { status: "ready"; view: SettingsView };

/** Saves a change; the new view, or the reason it was refused. */
export async function saveSettings(guildId: string, change: SettingsUpdate): Promise<SettingsView | { error: string }> {
  const res = await fetch(`${BACKEND_URL}/api/guilds/${guildId}/settings`, {
    method: "PUT",
    headers: { authorization: `Bearer ${currentAccessToken() ?? ""}`, "content-type": "application/json" },
    body: JSON.stringify(change),
  }).catch(() => null);
  if (!res) return { error: "เชื่อมต่อไม่ได้ ลองอีกครั้ง" };
  if (res.status === 403) return { error: "เฉพาะเจ้าของเซิร์ฟเวอร์หรือ Bot Owner ที่เปลี่ยนการตั้งค่าได้" };
  if (!res.ok) return { error: "บันทึกไม่สำเร็จ ลองอีกครั้ง" };
  const parsed = SettingsViewSchema.safeParse(await res.json().catch(() => null));
  return parsed.success ? parsed.data : { error: "บันทึกไม่สำเร็จ ลองอีกครั้ง" };
}

/**
 * One Guild's settings, kept live: a change saved in another tab arrives over the socket
 * (`settings:update`, spec #92).
 */
export function useGuildSettings(guildId: string): [SettingsState, (view: SettingsView) => void] {
  const [state, setState] = useState<SettingsState>({ status: "loading" });
  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    void apiGet(`/api/guilds/${guildId}/settings`)
      .then(async (res) => {
        if (!live) return;
        if (res.status === 404) return setState({ status: "missing" });
        const parsed = SettingsViewSchema.safeParse(res.ok ? await res.json() : null);
        setState(parsed.success ? { status: "ready", view: parsed.data } : { status: "failed" });
      })
      .catch(() => live && setState({ status: "failed" }));
    const off = onSocketEvents({
      [SocketEvents.settingsUpdate]: (raw: unknown) => {
        const update = raw as { guildId?: string; settings?: unknown };
        if (update?.guildId !== guildId) return;
        const settings = GuildSettingsSchema.safeParse(update.settings);
        if (!settings.success) return;
        setState((current) =>
          current.status === "ready"
            ? { status: "ready", view: { ...current.view, settings: settings.data } }
            : current,
        );
      },
    });
    return () => {
      live = false;
      off();
    };
  }, [guildId]);
  return [state, (view) => setState({ status: "ready", view })];
}

export type { SettingsView };
