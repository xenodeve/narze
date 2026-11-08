import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** Writes JSON whole or not at all: a temp file, then a rename (Queue Snapshots, sessions file). */
export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${crypto.randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(value));
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true });
  }
}
