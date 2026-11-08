/**
 * How to invoke Bun from Playwright: one definition, shared with the Supabase helper. `bun run`
 * sets npm_execpath to Bun's absolute path, which also works on Windows where a POSIX-style path
 * cannot be spawned. BUN_BIN overrides it.
 */
export { BUN } from "@narze/fake-discord/supabase-local";
