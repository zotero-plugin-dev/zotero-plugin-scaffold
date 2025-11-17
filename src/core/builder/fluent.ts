import type { BaseNode, Message, MessageReference, Resource } from "@fluent/syntax";
import type { BuildConfig } from "../../types/config.js";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { styleText } from "node:util";
import { parse, serialize, Transformer } from "@fluent/syntax";
import { move, outputFile } from "fs-extra/esm";
import { glob } from "tinyglobby";
import { logger } from "../../utils/logger.js";
import { toArray } from "../../utils/string.js";

export default async function buildLocale(
  dist: string,
  namespace: string,
  options: BuildConfig["fluent"],
) {
  const ignores = toArray(options.ignore);
  const localeNames = await getLocales(dist);
  const messageManager = new MessageManager(ignores);

  // Process FTL files and add messages to the manager
  await Promise.all(localeNames.map(async (locale) => {
    const paths = await glob(`${dist}/addon/locale/${locale}/**/*.ftl`);
    await Promise.all(paths.map(async (path) => {
      const fm = new FluentManager();
      await fm.read(path);
      messageManager.addMessages(locale, fm.getMessages());

      if (options.prefixFluentMessages) {
        fm.prefixMessages(namespace);
        await fm.write(path);
      }

      if (options.prefixLocaleFiles) {
        const newPath = `${dirname(path)}/${namespace}-${basename(path)}`;
        await move(path, newPath);
        logger.debug(`Renamed FTL: ${path} → ${newPath}`);
      }
    }));
  }));

  // Process HTML files and add messages to the manager
  const htmlPaths = await glob([`${dist}/addon/**/*.xhtml`, `${dist}/addon/**/*.html`]);
  await Promise.all(htmlPaths.map(async (htmlPath) => {
    const content = await readFile(htmlPath, "utf-8");
    const { processedContent, foundMessages } = processHTMLFile(
      content,
      namespace,
      messageManager.getFTLMessages(),
      ignores,
      htmlPath,
    );

    // Add all found HTML messages
    messageManager.addMessages("html", foundMessages);

    if (options.prefixFluentMessages) {
      await writeFile(htmlPath, processedContent);
    }
  }));

  // Validate that all HTML messages exist in all locales
  messageManager.validateMessages();

  if (options.dts) {
    const dtsContent = generateFluentDts([...messageManager.getFTLMessages()]);
    await outputFile(options.dts, dtsContent, "utf-8");
  }
}

async function getLocales(dist: string): Promise<string[]> {
  const localePaths = await glob(`${dist}/addon/locale/*`, { onlyDirectories: true });
  return localePaths.map(p => basename(p));
}

export class FluentManager {
  private source?: string;
  private resource?: Resource;
  public readonly messages: string[] = [];

  constructor() {}

  // Parse Fluent source into an AST and extract messages
  public parse(source: string) {
    this.source = source;
    this.resource = parse(source, {});
  }

  // Read a file, parse its content, and extract messages
  public async read(path: string) {
    const content = await readFile(path, "utf-8");
    this.parse(content);
  }

  // Extract message IDs from the parsed resource
  public getMessages(): string[] {
    if (!this.resource) {
      throw new Error("Resource must be parsed first.");
    }
    this.messages.length = 0; // Clear the previous messages
    this.messages.push(
      ...this.resource.body.filter(entry => entry.type === "Message")
        .map(message => message.id.name),
    );
    return this.messages;
  }

  // Apply namespace prefix to message IDs in the resource
  public prefixMessages(namespace: string) {
    if (!this.resource) {
      throw new Error("Resource must be parsed before applying prefix.");
    }
    new FluentTransformer(namespace).genericVisit(this.resource);
  }

  // Serialize the resource back into a string
  public serialize(): string {
    if (!this.resource) {
      throw new Error("Resource not parsed. Cannot serialize.");
    }
    return serialize(this.resource, {});
  }

  // Write the serialized resource to a file
  public async write(path: string) {
    const result = this.serialize();
    if (result !== this.source)
      await writeFile(path, this.serialize());
  }
}
// Custom Fluent AST transformer to apply message ID prefix
class FluentTransformer extends Transformer {
  constructor(private readonly prefix: string | false) {
    super();
  }

  private needsPrefix(name: string): boolean {
    return !!this.prefix && !name.startsWith(this.prefix);
  }

  visitMessage(node: Message): BaseNode {
    if (this.needsPrefix(node.id.name)) {
      node.id.name = `${this.prefix}-${node.id.name}`;
    }
    return this.genericVisit(node);
  }

  visitMessageReference(node: MessageReference): BaseNode {
    if (this.needsPrefix(node.id.name)) {
      node.id.name = `${this.prefix}-${node.id.name}`;
    }
    return this.genericVisit(node);
  }
}

export class MessageManager {
  private ftlMessages: Map<string, Set<string>> = new Map();
  private htmlMessages: Set<string> = new Set();
  private ignores: string[];

  constructor(ignores: string[]) {
    this.ignores = ignores;
  }

  // Add a set of messages (FTL or HTML) for a specific locale or for HTML globally
  addMessages(target: string | "html", messages: string[]) {
    if (target === "html") {
      messages.forEach(msg => this.htmlMessages.add(msg));
    }
    else {
      let ftlLocaleMessages = this.ftlMessages.get(target);
      if (!ftlLocaleMessages) {
        ftlLocaleMessages = new Set();
        this.ftlMessages.set(target, ftlLocaleMessages);
      }
      messages.forEach(msg => ftlLocaleMessages.add(msg));
    }
  }

  validateMessages() {
    // Check miss 1: Cross check in diff locale - seems no need
    // messagesByLocale.forEach((messageInThisLang, lang) => {
    //   // Needs Nodejs 22
    //   const diff = allMessages.difference(messageInThisLang);
    //   if (diff.size)
    //     this.logger.warn(`FTL messages '${Array.from(diff).join(", ")}' don't exist the locale '${lang}'`);
    // });

    // Check miss 2: Check ids in HTML but not in ftl
    this.htmlMessages.forEach((msg) => {
      if (this.ignores.includes(msg))
        return;

      const missingLocales = [...this.ftlMessages.entries()]
        .filter(([_, messages]) => !messages.has(msg))
        .map(([locale]) => locale);
      if (missingLocales.length > 0)
        logger.warn(`I10N id ${styleText("blue", msg)} missing in locale: ${missingLocales.join(", ")}`);
    });
  }

  getFTLMessages(): Set<string> {
    const allMessages = new Set<string>();
    this.ftlMessages.forEach(messages => messages.forEach(msg => allMessages.add(msg)));
    return allMessages;
  }

  // Get all FTL messages for a specific locale
  getFTLMessagesByLocale(locale: string): Set<string> {
    return this.ftlMessages.get(locale) || new Set();
  }

  // Get all HTML messages
  getHTMLMessages(): Set<string> {
    return this.htmlMessages;
  }
}

// Scan HTML content for l10n references and apply namespace prefix
export function processHTMLFile(
  content: string,
  namespace: string,
  allMessages: Set<string>,
  ignores: string[],
  filePath: string,
) {
  const foundMessages = new Set<string>();

  const L10N_PATTERN = new RegExp(`(data-l10n-id)="((?!${namespace})\\S*)"`, "g");
  const processed = content.replace(L10N_PATTERN, (match, attr, id) => {
    foundMessages.add(id);

    if (ignores.includes(id)) {
      logger.debug(`Skipped ignored ID: ${styleText("blue", id)} in ${styleText("gray", filePath)}`);
      return match;
    }

    if (!allMessages.has(id)) {
      logger.warn(`I10N id ${styleText("blue", id)} in path ${styleText("gray", filePath)} does not exist in any locale, skip renaming it.`);
      return match;
    }

    return `${attr}="${namespace}-${id}"`;
  });

  return { processedContent: processed, foundMessages: [...foundMessages] };
}

export function generateFluentDts(messages: string[]) {
  return `// Generated by zotero-plugin-scaffold
/* prettier-ignore */
/* eslint-disable */
// @ts-nocheck
export type FluentMessageId =
${Array.from(messages).sort().map(id => `  | '${id}'`).join("\n")};
`;
}
