/**
 * Update json
 * @see https://extensionworkshop.com/documentation/manage/updating-your-extension/
 */
export interface UpdateJSON {
  addons: {
    [addonID: string]: {
      updates: Array<{
        version: string;
        update_link?: string;
        /**
         * A cryptographic hash of the file pointed to by `update_link`.
         * This must be provided if `update_link` is not a secure URL.
         * If present, this must be a string beginning with either `sha256:` or `sha512:`,
         * followed by the hexadecimal-encoded hash of the matching type.
         */
        update_hash?: string;
        applications: {
          zotero: {
            strict_min_version?: string;
            strict_max_version?: string;
          };
          [application: string]: {
            strict_min_version?: string;
            strict_max_version?: string;
          };
        };
      }>;
    };
  };
}
