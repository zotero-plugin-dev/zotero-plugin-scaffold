import { Build, Config } from "zotero-plugin-scaffold";

async function main() {
  const config = await Config.loadConfig({
    source: ["src", "static"],
    dist: `dist`,
    name: "Test Plugin",
    id: "test-plugin",
    namespace: "test-plugin",
    updateURL: `https://github.com/{{owner}}/{{repo}}/releases/download/releaser/{{updateJson}}`,
    xpiDownloadLink: "https://github.com/{{owner}}/{{repo}}/releases/download/v{{version}}/{{xpiName}}.xpi",

    build: {
      assets: [
        "static/**/*.*",
      ],
      define: {
        buildTime: "{{buildTime}}",
      },
      fluent: {
        ignore: ["lint-on-item-added11", "section-item"],
      },
      prefs: {
        prefix: "extensions.testplugin",
      },
      esbuildOptions: [],
      makeUpdateJson: {
        hash: false,
        updates: [
          {
            version: "0.4.5",
            update_link: "https://example.com/example.xpi",
            applications: {
              gecko: {
                strict_min_version: "60.0",
              },
            },
          },
        ],
      },
    },

    // If you need to see a more detailed build log, uncomment the following line:
    // logLevel: "trace",
  });

  const build = new Build(config);
  await build.run();
}

main();
