/**
 * The Bot's tests use Redis database 2 (the Backend's tests use 0, e2e uses 1). `bun run test` runs
 * the packages in parallel, and the Bot's guild-registry test replaces the whole Bot guild set, which
 * the Backend's player test needs: on one database they raced and the Backend saw a 403 (#114).
 * The host comes from REDIS_URL when set (CI sets it); the database is always 2. Keys are per
 * database; pub/sub channels are not, so a running dev Backend can still hear a test's events.
 */
const url = new URL(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
url.pathname = "/2";
process.env.REDIS_URL = url.toString();
