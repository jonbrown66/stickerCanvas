import { readFile } from "node:fs/promises";
import ts from "typescript";

// Load the real local modules without a bundler or a browser. Imports are
// rewritten after transpilation so type-only imports do not need mocks.
export async function loadTypeScript(path) {
  const cache = new Map();
  async function moduleUrl(url) {
    if (cache.has(url.href)) return cache.get(url.href);
    const source = await readFile(url, "utf8");
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    output = output.replaceAll("import.meta.url", JSON.stringify(url.href));
    for (const match of [...output.matchAll(/from\s+["'](\.[^"']+)["']/g)]) {
      const specifier = match[1];
      const dependency = new URL(/\.[cm]?js$|\.tsx?$/.test(specifier) ? specifier : `${specifier}.ts`, url);
      output = output.replace(match[0], `from "${await moduleUrl(dependency)}"`);
    }
    const dataUrl = `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
    cache.set(url.href, dataUrl);
    return dataUrl;
  }
  return import(await moduleUrl(new URL(path, new URL("../../", import.meta.url))));
}
