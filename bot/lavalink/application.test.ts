import { expect, test } from "bun:test";
import { parse } from "yaml";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const config = parse(readFileSync(join(import.meta.dir, "application.yml"), "utf8"));
const lavalinkDir = import.meta.dir;
const pluginsDir = join(import.meta.dir, "plugins");

// --- Lavalink version ---

test("Lavalink-4.2.2.jar exists in lavalink/", () => {
    expect(existsSync(join(lavalinkDir, "Lavalink-4.2.2.jar"))).toBe(true);
});

test("startlavalink.bat references Lavalink-4.2.2.jar", () => {
    const bat = readFileSync(join(lavalinkDir, "startlavalink.bat"), "utf8");
    expect(bat).toContain("Lavalink-4.2.2.jar");
});

test("Lavalink-4.1.1.jar is removed from lavalink/", () => {
    expect(existsSync(join(lavalinkDir, "Lavalink-4.1.1.jar"))).toBe(false);
});

// --- Plugin declarations removed from application.yml (jars managed directly) ---

test("application.yml has no lavalink.plugins declarations (prevents SSL update-check crash)", () => {
    expect(config.lavalink.plugins).toBeUndefined();
});

test("ANDROID client is not in youtube clients list", () => {
    const clients: string[] = config.plugins?.youtube?.clients ?? [];
    expect(clients).not.toContain("ANDROID");
});

// --- Plugin jars present in plugins/ ---

test("youtube-plugin-1.18.1.jar exists in plugins/", () => {
    expect(existsSync(join(pluginsDir, "youtube-plugin-1.18.1.jar"))).toBe(true);
});

test("lavasrc-plugin-4.8.3.jar exists in plugins/", () => {
    expect(existsSync(join(pluginsDir, "lavasrc-plugin-4.8.3.jar"))).toBe(true);
});

test("lavasrc-plugin-4.8.1.jar is removed from plugins/", () => {
    expect(existsSync(join(pluginsDir, "lavasrc-plugin-4.8.1.jar"))).toBe(false);
});

test("lavasearch-plugin-1.0.0.jar exists in plugins/", () => {
    expect(existsSync(join(pluginsDir, "lavasearch-plugin-1.0.0.jar"))).toBe(true);
});

test("youtube-plugin-1.13.5.jar is removed from plugins/", () => {
    expect(existsSync(join(pluginsDir, "youtube-plugin-1.13.5.jar"))).toBe(false);
});

