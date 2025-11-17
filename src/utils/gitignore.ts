import { readFile } from "node:fs/promises";
import { pathExists } from "fs-extra";
import { logger } from "./logger.js";

export async function checkGitIgnore(): Promise<void> {
  if (!pathExists(".git"))
    return;

  if (!pathExists(".gitignore")) {
    logger.warn("No .gitignore file found");
    return;
  }

  const contents = await readFile(".gitignore", "utf-8");
  const ignores = ["node_modules", ".env", ".scaffold"];
  const miss = ignores.filter(ignore => !contents.match(ignore));

  // since this is just a simple reminder, we don't operate the user's
  // .gitignore file anymore, but prompt the user to add it manually.
  // this can avoid problems such as modifying the user's line breaks,
  // and it is not too complicated to implement.
  if (miss.length !== 0)
    logger.warn(`We recommend adding the following to your .gitignore file: ${miss.join(", ")}`);
}
