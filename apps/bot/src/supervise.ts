/**
 * Runs the Bot and starts it again after a Dashboard restart (#111). The Bot exits with
 * RESTART_EXIT_CODE for a restart and SHUTDOWN_EXIT_CODE (0) for a shutdown; any other exit is a
 * crash. Only a restart comes back here: a shutdown stays down, and a crash is left to whatever
 * runs this supervisor. `bun run start:supervised` in apps/bot.
 */
import { RESTART_EXIT_CODE } from "@narze/shared";

export function afterExit(code: number | null): "restart" | "stop" {
  return code === RESTART_EXIT_CODE ? "restart" : "stop";
}

if (import.meta.main) {
  let child: ReturnType<typeof Bun.spawn> | null = null;
  const forward = (signal: NodeJS.Signals) => () => child?.kill(signal);
  process.on("SIGINT", forward("SIGINT"));
  process.on("SIGTERM", forward("SIGTERM"));
  for (;;) {
    child = Bun.spawn([process.execPath, "src/main.ts"], { stdio: ["inherit", "inherit", "inherit"] });
    const code = await child.exited;
    if (afterExit(code) === "stop") process.exit(code ?? 1);
    console.log("[supervise] restart asked from the Dashboard; starting the Bot again");
  }
}
