import type { EventEmitter } from "node:events";
import { createInterface, type Interface } from "node:readline";
import type { ConsoleCommand } from "./parse";
import { parseCommand } from "./parse";

/**
 * The operator console's prompt (#112, spec #119): one command at a time, in the order typed.
 * `exit` closes the console only; Ctrl+C stops the Bot through its normal shutdown. Without a
 * terminal on stdin (a service, a container) the console stays off.
 */
export function startRepl({
  run,
  interrupt,
  input = process.stdin,
  output = process.stdout,
}: {
  run: (command: ConsoleCommand) => Promise<void>;
  interrupt: () => void;
  input?: NodeJS.ReadableStream & { isTTY?: boolean };
  output?: NodeJS.WritableStream;
}): Interface | null {
  if (!input.isTTY) {
    console.log("[console] stdin is not a terminal: the operator console is off");
    return null;
  }
  const rl = createInterface({ input, output, prompt: "narze> " });
  // This repo's typings drop EventEmitter from readline's Interface; it is one at runtime.
  const events = rl as unknown as EventEmitter;
  let queue = Promise.resolve();
  // Commands typed before `exit` still finish; only an open console shows the prompt again.
  let open = true;
  events.once("close", () => {
    open = false;
  });
  events.on("line", (line: string) => {
    const command = parseCommand(line);
    if (command.kind === "exit") {
      rl.close();
      console.log("[console] closed; the Bot keeps running");
      return;
    }
    queue = queue
      .then(() => run(command))
      .catch((error: unknown) => console.warn(`[console] ${error instanceof Error ? error.message : error}`))
      .finally(() => {
        if (open) rl.prompt();
      });
  });
  events.on("SIGINT", interrupt);
  console.log("[console] พิมพ์ help เพื่อดูคำสั่ง (exit ปิดแค่ console)");
  rl.prompt();
  return rl;
}
