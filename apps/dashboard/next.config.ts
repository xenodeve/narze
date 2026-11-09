import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

// The repo keeps one .env at its root, but Next reads env files only from this folder (#152). Load the
// root one so `bun run build` inlines NEXT_PUBLIC_* from wherever it is run. loadEnvFile never overrides
// a variable already set, so values given by the caller (e2e, the shell) win; no file, nothing to load.
const rootEnv = resolve(__dirname, "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@narze/shared"],
};

export default config;
