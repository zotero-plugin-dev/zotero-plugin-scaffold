export function dateFormat(fmt: string, date: Date) {
  let ret;
  const opt: { [key: string]: string } = {
    "Y+": date.getFullYear().toString(),
    "m+": (date.getMonth() + 1).toString(),
    "d+": date.getDate().toString(),
    "H+": date.getHours().toString(),
    "M+": date.getMinutes().toString(),
    "S+": date.getSeconds().toString(),
  };
  for (const k in opt) {
    ret = new RegExp(`(${k})`).exec(fmt);
    if (ret) {
      fmt = fmt.replace(
        ret[1],
        ret[1].length === 1 ? opt[k] : opt[k].padStart(ret[1].length, "0"),
      );
    }
  }
  return fmt;
}

export function toArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

/**
 * template is used to replace data by name in template strings.
 * The default expression looks for {{name}} to identify names.
 *
 * Ex. template('Hello, {{name}}', { name: 'ray' })
 * Ex. template('Hello, <name>', { name: 'ray' }, /<(.+?)>/g)
 *
 * @see https://github.com/sodiray/radash/blob/069b26cdd7d62e6ac16a0ad3baa1c9abcca420bc/src/string.ts#L111-L126
 */
export function template(str: string, data: Record<string, any>, regex = /\{\{(.+?)\}\}/g) {
  return Array.from(str.matchAll(regex)).reduce((acc, match) => {
    return acc.replace(match[0], data[match[1]]);
  }, str);
}

export function parseRepoUrl(url?: string) {
  if (!url)
    throw new Error("Parse repository URL failed.");

  const match = (url).match(/:\/\/.+com\/([^/]+)\/([^.]+)\.git$/);
  if (!match) {
    throw new Error("Parse repository URL failed.");
  }
  const [, owner, repo] = match;
  return { owner, repo };
}
