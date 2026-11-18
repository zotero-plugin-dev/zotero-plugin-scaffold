import type { ContextOf } from "./types.js";

export interface Command {
  run: () => void | Promise<void>;
  /**
   * Release the resources the command created (esbuild contexts, watchers,
   * servers, child processes). Idempotent, safe before `run()`, and never
   * exits the process.
   */
  stop?: () => void | Promise<void>;
}

export type CommandFactory<
  TCommand extends Command = Command,
  TContext extends ContextOf = ContextOf,
> = (ctx: TContext) => Promise<TCommand>;
