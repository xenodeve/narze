/** Injection token for the dedicated Redis connection used in subscriber mode. */
export const REDIS_SUBSCRIBER = Symbol("REDIS_SUBSCRIBER");
/** Injection token for the Redis connection used for commands (reads and writes). */
export const REDIS = Symbol("REDIS");
/** Injection token for the Supabase client holding the secret key (bypasses RLS; server only). */
export const SUPABASE = Symbol("SUPABASE");
/** Injection token for NARZE_DEVELOPER_IDS: Discord IDs that are always Developers (#110). */
export const DEVELOPER_IDS = Symbol("DEVELOPER_IDS");
/** Injection token for the Discord REST base URL. */
export const DISCORD_API_URL = Symbol("DISCORD_API_URL");
/** Injection token for how long the Backend waits for the Bot to answer an AdminQuery (#111). */
export const ADMIN_QUERY_TIMEOUT_MS = Symbol("ADMIN_QUERY_TIMEOUT_MS");
