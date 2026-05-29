import { expect, test } from "bun:test";
import { parse } from "yaml";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const config = parse(readFileSync(join(import.meta.dir, "application.yml"), "utf8"));
const pluginsDir = join(import.meta.dir, "plugins");

test("youtube-plugin version is 1.18.1", () => {
    const dep = config.lavalink.plugins.find((p: any) =>
        p.dependency?.includes("youtube-plugin")
    );
    expect(dep?.dependency).toContain("1.18.1");
});

test("ANDROID client is not in youtube clients list", () => {
    const clients: string[] = config.plugins?.youtube?.clients ?? [];
    expect(clients).not.toContain("ANDROID");
});

test("youtube-plugin-1.18.1.jar exists in plugins/", () => {
    expect(existsSync(join(pluginsDir, "youtube-plugin-1.18.1.jar"))).toBe(true);
});

test("youtube-plugin-1.13.5.jar is removed from plugins/", () => {
    expect(existsSync(join(pluginsDir, "youtube-plugin-1.13.5.jar"))).toBe(false);
});
