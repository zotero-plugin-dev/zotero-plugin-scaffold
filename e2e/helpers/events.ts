import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

/** The fixture's config appends one line per lifecycle hook. */
export const EVENT_LOG = ".scaffold/events.jsonl";

export async function readEvents(dir: string): Promise<string[]> {
  try {
    const content = await readFile(join(dir, EVENT_LOG), "utf-8");
    return content.split("\n").filter(line => line.trim() !== "");
  }
  catch {
    return [];
  }
}

export async function hasEvent(dir: string, name: string): Promise<boolean> {
  return (await readEvents(dir)).includes(name);
}

export async function waitForEvent(
  dir: string,
  name: string,
  { timeoutMs = 120_000, intervalMs = 100 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const startedAt = Date.now();

  for (;;) {
    if (await hasEvent(dir, name))
      return;

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(
        `Timed out waiting for the "${name}" event. Recorded: ${(await readEvents(dir)).join(", ") || "<none>"}`,
      );
    }

    await new Promise(resolvePromise => setTimeout(resolvePromise, intervalMs));
  }
}

export async function clearEvents(dir: string): Promise<void> {
  await rm(join(dir, EVENT_LOG), { force: true });
}

export async function appendEvent(dir: string, name: string): Promise<void> {
  await mkdir(join(dir, ".scaffold"), { recursive: true });
  await appendFile(join(dir, EVENT_LOG), `${name}\n`);
}
