import { PREF_PREFIX } from "./config";

export const EXTRA_MARKER = "fixture-extra-bundle";

export function describePlugin(): string {
  return `${EXTRA_MARKER}: ${PREF_PREFIX}`;
}
