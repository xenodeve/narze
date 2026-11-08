/**
 * How to invoke Bun from Playwright. `bun run` sets npm_execpath to Bun's absolute path, which
 * also works on Windows where a POSIX-style path cannot be spawned. BUN_BIN overrides both.
 */
export const BUN = process.env.BUN_BIN ?? process.env.npm_execpath ?? "bun";
