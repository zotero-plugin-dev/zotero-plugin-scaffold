import { outputFile } from "fs-extra/esm";

export async function saveResource(url: string, path: string) {
  const res = await fetch(url);
  await outputFile(path, await res.text());
}
