# Zotero Plugin Development Scaffold

[![NPM Version](https://img.shields.io/npm/v/zotero-plugin-scaffold)](https://www.npmjs.com/package/zotero-plugin-scaffold)
[![NPM Downloads](https://img.shields.io/npm/dm/zotero-plugin-scaffold)](https://www.npmjs.com/package/zotero-plugin-scaffold)
![NPM Unpacked Size](https://img.shields.io/npm/unpacked-size/zotero-plugin-scaffold)
![GitHub License](https://img.shields.io/github/license/zotero-plugin-dev/zotero-plugin-scaffold)
[![code style](https://antfu.me/badge-code-style.svg)](https://github.com/antfu/eslint-config)

This is an npm package designed to assist in the development of Zotero plugins. It provides features such as compiling plugins, starting Zotero and installing plugins from source code, reloading plugins when the source code changes, and releasing plugins, and so on.

Initially, the code of this package was part of the [zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template) repository. To allow downstream developers to easily stay up-to-date, we have abstracted these scripts into a standalone npm package.

This project is under active development, and some APIs may change. However, it is ready for production and has been [used in several projects](https://github.com/zotero-plugin-dev/zotero-plugin-scaffold/network/dependents).

For best practices regarding this package, please refer to [zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template).

## Documentation

[Read the Docs to Learn More](https://zotero-plugin-dev.github.io/zotero-plugin-scaffold).

## Contributing

```bash
# Git Clone
git clone https://github.com/zotero-plugin-dev/zotero-plugin-scaffold.git
cd zotero-plugin-scaffold/

# Install deps
corepack enable
pnpm install

# Development Mode
# This command creates a typescript runtime using jiti,
# and the modified code does not need to be built again.
pnpm run dev

# link local scaffold to your plugin
cd your-plugin-work-dir/
pnpm link ../zotero-plugin-scaffold/
cd zotero-plugin-scaffold/
```

Now you can make changes to Scaffold and test them in your plugin.

When you're done modifying, make sure that you can pass the build and that the code style meets the requirements of this repository.

```bash
# Build
pnpm run build

# ES Lint
pnpm run lint:fix
```

## License

GNU Affero General Public License Version 3.

## Acknowledgements

This project references the design and code of the [Zotero Plugin Template](https://github.com/windingwind/zotero-plugin-template).

This project would not be possible without the support of the [open source community](https://github.com/zotero-plugin-dev/zotero-plugin-scaffold/network/dependencies).
