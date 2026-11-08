import { join } from "./join";
import { leave } from "./leave";
import { pause } from "./pause";
import { ping } from "./ping";
import { play } from "./play";
import { seek } from "./seek";
import { skip } from "./skip";
import type { Command } from "./types";
import { volume } from "./volume";

/** The slash commands of #100; the other ten of spec #1 arrive with #102–#104. */
export const commands: Command[] = [play, pause, skip, seek, volume, join, leave, ping];
