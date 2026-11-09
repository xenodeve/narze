import { describe, expect, test } from "bun:test";
import { commands } from "../src/commands";
import { registerCommands } from "../src/commands/register";

describe("slash command registration (#147)", () => {
  test("every command is sent to Discord in one call, as v5 did on every start", async () => {
    const calls: unknown[][] = [];
    const application = { commands: { set: async (body: readonly unknown[]) => void calls.push([...body]) } };
    await registerCommands(application, commands);
    expect(calls).toHaveLength(1);
    const sent = calls[0] as Array<{ name: string; description: string }>;
    expect(sent.map((c) => c.name)).toEqual(commands.map((c) => c.data.name));
    // What Discord needs: plain JSON with a description, not the builder.
    for (const c of sent) expect(typeof c.description).toBe("string");
  });
});
