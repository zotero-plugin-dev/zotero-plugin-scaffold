import type { BooleanLiteral, NumericLiteral, StringLiteral, UnaryExpression } from "@oxc-project/types";
import type { ParseResult } from "rolldown/experimental";
import { readFile } from "node:fs/promises";
import { print } from "esrap";
import ts from "esrap/languages/ts";
import { outputFile } from "fs-extra/esm";
import { parseSync } from "rolldown/experimental";
import { logger } from "./logger.js";

class PrefFileError extends Error {
  constructor(message: string) {
    super();
    this.message = `Invalid prefs.js file - ${message}`;
  }
}

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
  parse(content: string): Prefs {
    const _map: Prefs = {};
    const { program, errors } = parseSync("prefs.js", content);
    if (errors.length)
      throw new PrefFileError(errors.map(e => e.message).join("\n"));

    for (const node of program.body) {
      if (
        node.type !== "ExpressionStatement"
        || node.expression.type !== "CallExpression"
        || node.expression.callee.type !== "Identifier"
        || node.expression.callee.name !== this.namespace
        || node.expression.arguments.length !== 2
      ) {
        throw new PrefFileError(`No ${this.namespace} callee found`);
      }

      const [arg1, arg2] = node.expression.arguments;

      if (arg1.type !== "Literal" || typeof arg1.value !== "string") {
        throw new PrefFileError(`Unsupported key type for ${arg1}`);
      }
      const key = arg1.value?.trim();

      let value: PrefValue;
      switch (arg2.type) {
        case "Literal":
          if (
            typeof arg2.value !== "boolean"
            && typeof arg2.value !== "string"
            && typeof arg2.value !== "number"
          ) {
            throw new PrefFileError(`Unsupported value type for ${arg2}`);
          }
          value = arg2.value;
          break;

        // https://github.com/estree/estree/blob/master/es5.md#unaryexpression
        // https://github.com/northword/zotero-plugin-scaffold/issues/98
        case "UnaryExpression":
          if (arg2.argument.type !== "Literal" || typeof arg2.argument.value !== "number")
            throw new PrefFileError(`Unsupported value type for ${arg2}`);

          if (arg2.operator === "-")
            value = -arg2.argument.value;
          else if (arg2.operator === "+")
            value = arg2.argument.value;
          else
            throw new PrefFileError(`Unsupported value type for ${arg2}`);
          break;

        case "TemplateLiteral":
          value = arg2.quasis[0]?.value.cooked ?? "";
          break;

        default:
          throw new PrefFileError(`Unsupported value type for ${arg2}`);
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

  cleanValue(value: string): string | number | boolean {
    if (value === "true")
      return true;
    else if (value === "false")
      return false;
    else if (!Number.isNaN(Number(value)))
      return Number(value);
    // eslint-disable-next-line regexp/no-unused-capturing-group
    else if (/^["'](.*)["']$/.test(value))
      return value.replace(/^["'](.*)["']$/, "$1");
    else
      return value;
  }

  /**
   * Render Method 2 - Using swc
   */
  render(): string {
    const span = { start: 0, end: 0, ctxt: 0 };

    function getExpression(value: unknown): StringLiteral | NumericLiteral | BooleanLiteral | UnaryExpression {
      switch (typeof value) {
        case "string":
        case "boolean":
          return {
            type: "Literal",
            ...span,
            value,
            raw: null,
          } satisfies StringLiteral | BooleanLiteral;
        case "number":
          if (value < 0) {
            return {
              type: "UnaryExpression",
              ...span,
              operator: "-",
              argument: {
                type: "Literal",
                ...span,
                value: Math.abs(value),
                raw: null,
              },
              prefix: true,
            } satisfies UnaryExpression;
          }
          return {
            type: "Literal",
            ...span,
            value,
            raw: null,
          } satisfies NumericLiteral;
        default:
          throw new Error(`Unsupported value type: ${typeof value}`);
      }
    }

    const program: ParseResult["program"] = {
      type: "Program",
      sourceType: "script",
      hashbang: null,
      ...span,
      body: Object.entries(this.prefs).map(([key, value]) => ({
        type: "ExpressionStatement",
        ...span,
        expression: {
          type: "CallExpression",
          ...span,
          optional: false,
          callee: {
            type: "Identifier",
            name: this.namespace,
            ...span,
          },
          arguments: [
            getExpression(key),
            getExpression(value),
          ],
        },
      })),
    };
    // @ts-expect-error no comments, loc, token
    const { code } = print(program, ts({ quotes: "double" }));
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

  async read(path: string): Promise<void> {
    const content = await readFile(path, "utf-8");
    const map = this.parse(content);
    this.setPrefs(map);
  }

  async write(path: string): Promise<void> {
    const content = this.render();
    await outputFile(path, content, "utf-8");
    logger.debug("The prefs.js has been modified.");
  }

  setPref(key: string, value: PrefValue | undefined | null): void {
    if (value === null || value === undefined) {
      if (key in this.prefs)
        delete this.prefs[key];
      return;
    }

    this.prefs[key] = value;
  };

  setPrefs(prefs: Record<string, PrefValue | undefined | null>): void {
    Object.entries(prefs).forEach(([key, value]) => {
      this.setPref(key, value);
    });
  }

  getPref(key: string): PrefValue {
    return this.prefs[key] ?? undefined;
  }

  getPrefs(): Prefs {
    return this.prefs;
  }

  clearPrefs(): void {
    this.prefs = {};
  }

  getPrefsWithPrefix(prefix: string): Prefs {
    const _prefs: Prefs = {};
    for (const pref in this.prefs) {
      if (pref.startsWith(prefix))
        _prefs[pref] = this.prefs[pref];
      else
        _prefs[`${prefix}.${pref}`] = this.prefs[pref];
    }
    return _prefs;
  }

  getPrefsWithoutPrefix(prefix: string): Prefs {
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
  type: "Program",
  body: [
    {
      type: "ExpressionStatement",
      expression: {
        type: "CallExpression",
        callee: {
          type: "Identifier",
          name: "pref",
          start: 0,
          end: 4,
        },
        arguments: [
          {
            type: "Literal",
            value: "key2",
            raw: "\"key2\"",
            start: 5,
            end: 11,
          },
          {
            type: "Literal",
            value: "value",
            raw: "\"value\"",
            start: 13,
            end: 20,
          },
        ],
        optional: false,
        start: 0,
        end: 21,
      },
      start: 0,
      end: 21,
    },
    {
      type: "ExpressionStatement",
      expression: {
        type: "CallExpression",
        callee: {
          type: "Identifier",
          name: "pref",
          start: 22,
          end: 26,
        },
        arguments: [
          {
            type: "Literal",
            value: "key1",
            raw: "\"key1\"",
            start: 27,
            end: 33,
          },
          {
            type: "UnaryExpression",
            operator: "-",
            argument: {
              type: "Literal",
              value: 1,
              raw: "1",
              start: 36,
              end: 37,
            },
            prefix: true,
            start: 35,
            end: 37,
          },
        ],
        optional: false,
        start: 22,
        end: 38,
      },
      start: 22,
      end: 38,
    },
  ],
  sourceType: "script",
  hashbang: null,
  start: 0,
  end: 38,
};
