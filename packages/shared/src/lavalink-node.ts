/**
 * Where the Lavalink node is, read the way docker compose reads it (`${LAVALINK_PASSWORD:-youshallnotpass}`):
 * an unset or empty value takes the default (#150). `.env.example` ships `LAVALINK_PASSWORD=`, and an
 * empty password made the Bot's LavalinkManager throw on start while compose ran with the default.
 */
export function lavalinkNode(env: Record<string, string | undefined>): {
  host: string;
  port: number;
  password: string;
} {
  return {
    host: env.LAVALINK_HOST || "127.0.0.1",
    port: Number(env.LAVALINK_PORT || 2333),
    password: env.LAVALINK_PASSWORD || "youshallnotpass",
  };
}
