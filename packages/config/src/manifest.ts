export interface Manifest {
  [key: string]: any;
  manifest_version: number;
  name: string;
  version: string;
  description?: string;
  homepage_url?: string;
  author?: string;
  icons?: Record<string, string>;
  applications: {
    zotero: {
      id: string;
      update_url: string;
      strict_min_version?: string;
      strict_max_version?: string;
    };
  };
}
