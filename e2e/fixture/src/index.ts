import { PREF_PREFIX } from "./config";

export interface FixtureApi {
  initialized: boolean;
  prefsPrefix: string;
}

const api: FixtureApi = {
  initialized: true,
  prefsPrefix: PREF_PREFIX,
};

globalThis.ScaffoldFixture = api;
