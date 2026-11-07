# ESLint Config Preset

## Features

- Flat ESLint configuration, easily composable!
- Designed with TypeScript in mind.
- Ignores common files such as `.scaffold`, `dist`, `node_modules`, and files listed in `.gitignore`.
- [Special cases](./src/configs/specialCases.ts) tailored for Zotero plugins.
- Mocha support.

## Usage

```bash
npm install -D @zotero-plugin/eslint-config
```

```js
import zotero from "@zotero-plugin/eslint-config";

export default zotero();
```

### Overrides

```js
import zotero from "@zotero-plugin/eslint-config";

export default zotero({
  overrides: [
    {
      files: ["**/*.ts"],
      rules: {
        "@typescript-eslint/no-unused-vars": "off",
      },
    },
  ],
});
```

### Integration with Other ESLint Configurations

```js
import antfu from "@antfu/eslint-config";
import { specialCases } from "@zotero-plugin/eslint-config";

export default antfu().append(specialCases);
```

Or:

```js
import zotero from "@zotero-plugin/eslint-config";
import xxx from "eslint-config-xxx";

export default [
  ...xxx,
  ...zotero
];
```
