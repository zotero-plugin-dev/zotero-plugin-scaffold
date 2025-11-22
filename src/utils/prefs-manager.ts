import type { Program } from "@swc/core";
import { readFile } from "node:fs/promises";
import { parseSync, printSync } from "@swc/core";
import { outputFile } from "fs-extra/esm";
import { logger } from "./logger.js";

/**
 * type of pref value only supports string (Char, String), number (Int), and boolean (Boolean)
 *
 * @see https://firefox-source-docs.mozilla.org/devtools/preferences.html#preference-types
 */
type PrefValue = string | number | boolean;
export type Prefs = Record<string, PrefValue>;

export class PrefsManager {
  private namespace: "pref" | "user_pref";
  private prefs: Prefs = {};

  constructor(namespace: "pref" | "user_pref") {
    this.namespace = namespace;
  }

  /**
   * Parse Method 3 - Using AST
   */
  parse(content: string) {
    const _map: Prefs = {};
    const ast = parseSync(content, { syntax: "ecmascript" });
    for (const node of ast.body) {
      if (
        node.type !== "ExpressionStatement"
        || node.expression.type !== "CallExpression"
        || node.expression.callee.type !== "Identifier"
        || node.expression.callee.value !== this.namespace
        || node.expression.arguments.length !== 2
      ) {
        throw new Error("Invalid prefs.js file.");
      }

      const [arg1, arg2] = node.expression.arguments;

      if (arg1.expression.type !== "StringLiteral") {
        throw new Error("Invalid prefs.js file - unsupported key type.");
      }
      const key = arg1.expression.value.trim();

      let value: PrefValue;
      switch (arg2.expression.type) {
        // https://babeljs.io/docs/babel-parser#output
        case "StringLiteral":
        case "NumericLiteral":
        case "BooleanLiteral":
          value = arg2.expression.value;
          break;

        // https://github.com/estree/estree/blob/master/es5.md#unaryexpression
        // https://github.com/northword/zotero-plugin-scaffold/issues/98
        case "UnaryExpression":
          if (arg2.expression.argument.type !== "NumericLiteral")
            throw new Error("Invalid prefs.js file - unsupported value type.");

          if (arg2.expression.operator === "-")
            value = -arg2.expression.argument.value;
          else if (arg2.expression.operator === "+")
            value = arg2.expression.argument.value;
          else
            throw new Error("Invalid prefs.js file - unsupported value type.");
          break;

        case "TemplateLiteral":
          value = arg2.expression.quasis[0]?.cooked ?? "";
          break;

        default:
          throw new Error("Invalid prefs.js file - unsupported value type.");
      }

      _map[key] = value;
    }

    return _map;
  }

  /**
   * Parse Method 1 - Using RegExp
   * @deprecated
   */
  private parseByRegExp(content: string) {
    const _map: Prefs = {};
    // eslint-disable-next-line regexp/no-super-linear-backtracking
    const prefPattern = /^(pref|user_pref)\s*\(\s*["']([^"']+)["']\s*,\s*(.+)\s*,?\s*\)\s*;?$/gm;
    const matches = content.matchAll(prefPattern);
    for (const match of matches) {
      const key = match[2].trim();
      const value = match[3].trim();
      _map[key] = this.cleanValue(value);
    }
    return _map;
  }

  /**
   * Parse Method 2 - Using eval
   * @deprecated
   */
  // private parseByEval(content: string) {
  //   const _map: Prefs = {};
  //   // eslint-disable-next-line unused-imports/no-unused-vars
  //   const pref = (key: any, value: any) => {
  //     _map[key.trim()] = this.cleanValue(value.trim());
  //   };
  //   // eslint-disable-next-line no-eval
  //   eval(content);
  //   return _map;
  // }

  cleanValue(value: string) {
    if (value === "true")
      return true;
    else if (value === "false")
      return false;
    else if (!Number.isNaN(Number(value)))
      return Number(value);
    else if (value.match(/^["'](.*)["']$/))
      return value.replace(/^["'](.*)["']$/, "$1");
    else
      return value;
  }

  /**
   * Render Method 2 - Using swc
   */
  render() {
    const span = { start: 0, end: 0, ctxt: 0 };

    function getExpression(value: unknown) {
      switch (typeof value) {
        case "string":
          return {
            type: "StringLiteral",
            span,
            value,
          };
        case "boolean":
          return {
            type: "BooleanLiteral",
            span,
            value,
          };
        case "number":
          if (value < 0) {
            return {
              type: "UnaryExpression",
              span,
              operator: "-",
              argument: {
                type: "NumericLiteral",
                span,
                value: Math.abs(value),
              },
            };
          }
          return {
            type: "NumericLiteral",
            span,
            value,
          };
        default:
          throw new Error(`Unsupported value type: ${typeof value}`);
      }
    }

    const ast: Program = {
      type: "Module",
      span,
      // @ts-expect-error no raw property
      body: Object.entries(this.prefs).map(([key, value]) => ({
        type: "ExpressionStatement",
        span,
        expression: {
          type: "CallExpression",
          span,
          ctxt: 0,
          callee: {
            type: "Identifier",
            span,
            ctxt: 0,
            value: this.namespace,
            optional: false,
          },
          arguments: [
            { expression: getExpression(key) },
            { expression: getExpression(value) },
          ],
        },
      })),
    };
    const { code } = printSync(ast);
    return code;
  }

  /**
   * Render Method 1 - Using string
   * @deprecated
   */
  private renderByString() {
    return Object.entries(this.prefs).map(([key, value]) => {
      const _v = typeof value === "string"
        ? `"${value
          .replaceAll("\\", "\\\\")
          .replaceAll("\"", "\\\"")}"`
        : value;
      return `${this.namespace}("${key}", ${_v});`;
    }).join("\n");
  }

  async read(path: string) {
    const content = await readFile(path, "utf-8");
    const map = this.parse(content);
    this.setPrefs(map);
  }

  async write(path: string) {
    const content = this.render();
    await outputFile(path, content, "utf-8");
    logger.debug("The prefs.js has been modified.");
  }

  setPref(key: string, value: PrefValue | undefined | null) {
    if (value === null || value === undefined) {
      if (key in this.prefs)
        delete this.prefs[key];
      return;
    }

    this.prefs[key] = value;
  };

  setPrefs(prefs: Record<string, PrefValue | undefined | null>) {
    Object.entries(prefs).forEach(([key, value]) => {
      this.setPref(key, value);
    });
  }

  getPref(key: string) {
    return this.prefs[key] ?? undefined;
  }

  getPrefs() {
    return this.prefs;
  }

  clearPrefs() {
    this.prefs = {};
  }

  getPrefsWithPrefix(prefix: string) {
    const _prefs: Prefs = {};
    for (const pref in this.prefs) {
      if (pref.startsWith(prefix))
        _prefs[pref] = this.prefs[pref];
      else
        _prefs[`${prefix}.${pref}`] = this.prefs[pref];
    }
    return _prefs;
  }

  getPrefsWithoutPrefix(prefix: string) {
    const _prefs: Prefs = {};
    for (const pref in this.prefs) {
      _prefs[pref.replace(`${prefix}.`, "")] = this.prefs[pref];
    }
    return _prefs;
  }
}

/** Backup */
// // prettier-ignore
// type PluginPrefKey<K extends keyof _PluginPrefsMap> = \`${prefix}.\${K}\`;
//
// // prettier-ignore
// type PluginPrefsMap = {
//   [K in keyof _PluginPrefsMap as PluginPrefKey<K>]: _PluginPrefsMap[K]
// };
//
// declare namespace _ZoteroTypes {
//   interface Prefs {
//     get: <K extends keyof PluginPrefsMap>(key: K, global?: boolean) => PluginPrefsMap[K];
//     set: <K extends keyof PluginPrefsMap>(key: K, value: PluginPrefsMap[K], global?: boolean) => any;
//   }
// }

/**
 * AST example
 *
 * @example
 * pref("key2", "value")
 * pref("key1", -1)
 */
const _ast_example = {
  type: "Module",
  span: {
    start: 0,
    end: 39,
  },
  body: [
    {
      type: "ExpressionStatement",
      span: {
        start: 0,
        end: 21,
      },
      expression: {
        type: "CallExpression",
        span: {
          start: 0,
          end: 21,
        },
        ctxt: 0,
        callee: {
          type: "Identifier",
          span: {
            start: 0,
            end: 4,
          },
          ctxt: 1,
          value: "pref",
          optional: false,
        },
        arguments: [
          {
            spread: null,
            expression: {
              type: "StringLiteral",
              span: {
                start: 5,
                end: 11,
              },
              value: "key2",
              raw: "\"key2\"",
            },
          },
          {
            spread: null,
            expression: {
              type: "StringLiteral",
              span: {
                start: 13,
                end: 20,
              },
              value: "value",
              raw: "\"value\"",
            },
          },
        ],
        typeArguments: null,
      },
    },
    {
      type: "ExpressionStatement",
      span: {
        start: 23,
        end: 39,
      },
      expression: {
        type: "CallExpression",
        span: {
          start: 23,
          end: 39,
        },
        ctxt: 0,
        callee: {
          type: "Identifier",
          span: {
            start: 23,
            end: 27,
          },
          ctxt: 1,
          value: "pref",
          optional: false,
        },
        arguments: [
          {
            spread: null,
            expression: {
              type: "StringLiteral",
              span: {
                start: 28,
                end: 34,
              },
              value: "key1",
              raw: "\"key1\"",
            },
          },
          {
            spread: null,
            expression: {
              type: "UnaryExpression",
              span: {
                start: 36,
                end: 38,
              },
              operator: "-",
              argument: {
                type: "NumericLiteral",
                span: {
                  start: 37,
                  end: 38,
                },
                value: 1,
                raw: "1",
              },
            },
          },
        ],
        typeArguments: null,
      },
    },
  ],
  interpreter: null,
};
