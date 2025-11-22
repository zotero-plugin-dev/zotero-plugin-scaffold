import { extname } from "node:path";

const mimeTypes: { [key: string]: string } = {
  json: "application/json",
  xpi: "application/x-xpinstall",
};

export function getMimeTypeByFileName(filename: string) {
  const ext = extname(filename);

  for (const type in mimeTypes) {
    if (ext === `.${type}`)
      return mimeTypes[type];
  }

  return undefined;
}
