import { clear } from "./clear";
import { join } from "./join";
import { leave } from "./leave";
import { loop } from "./loop";
import { pause } from "./pause";
import { ping } from "./ping";
import { playat, playnext, skipplay } from "./placed-play";
import { play } from "./play";
import { playqueue } from "./playqueue";
import { queue } from "./queue";
import { seek } from "./seek";
import { skip } from "./skip";
import { twentyFourSeven } from "./twenty-four-seven";
import type { Command } from "./types";
import { volume } from "./volume";

/** The slash commands so far (spec #1): #100, #102 and #103; /setchannel and /cache arrive with #106 and #104. */
export const commands: Command[] = [
  play,
  pause,
  skip,
  seek,
  volume,
  join,
  leave,
  ping,
  queue,
  clear,
  loop,
  playnext,
  playat,
  playqueue,
  skipplay,
  twentyFourSeven,
];
