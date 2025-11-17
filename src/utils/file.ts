import { outputFile } from "fs-extra/esm";

export async function saveResource(url: string, path: string): Promise<void> {
  const res = await fetch(url);
  await outputFile(path, await res.text());
}
