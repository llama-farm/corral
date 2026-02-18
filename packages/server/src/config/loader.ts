import { parse as parseYaml } from "yaml";
import { corralConfigSchema, type CorralConfig } from "./schema.js";

// Lazy-initialized readFileSync for Node.js file reading.
// Avoids top-level import of node:module which crashes edge runtimes.
let _readFileSync: ((path: string, encoding: string) => string) | null = null;

function resolveEnvVars(obj: unknown): unknown {
  if (typeof obj === "string") {
    return obj.replace(/\$\{(\w+)\}/g, (_, key) => process.env[key] ?? "");
  }
  if (Array.isArray(obj)) return obj.map(resolveEnvVars);
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = resolveEnvVars(v);
    }
    return result;
  }
  return obj;
}

/**
 * Load and validate a Corral config.
 *
 * Accepts:
 *  - A plain config object (works everywhere, including serverless).
 *  - A YAML string (works everywhere).
 *  - A file path string (Node.js only — uses dynamic import of `node:fs`).
 */
export function loadConfig(pathOrConfig: string | Record<string, unknown>): CorralConfig {
  let raw: unknown;
  if (typeof pathOrConfig === "object") {
    raw = pathOrConfig;
  } else if (pathOrConfig.trim().startsWith("{") || pathOrConfig.includes("\n")) {
    // Looks like inline YAML/JSON content
    raw = parseYaml(pathOrConfig);
  } else {
    // File path — use synchronous fs for backwards compat (Node.js only).
    // In serverless environments, pass a config object or YAML string instead.
    try {
      if (!_readFileSync) {
        // Try CJS require first (works in bundled output & CJS), then createRequire (Node ESM)
        const cjsRequire = Function("try{return require}catch{return null}")() as any;
        if (cjsRequire) {
          _readFileSync = cjsRequire("node:fs").readFileSync;
        } else {
          // This branch is reached in pure Node ESM — fall back to sync error.
          // Users should use loadConfigAsync() or pass a config object.
          throw Object.assign(
            new Error("[Corral] Synchronous file loading unavailable in this ESM runtime. Use loadConfigAsync() or pass a config object."),
            { code: "MODULE_NOT_FOUND" },
          );
        }
      }
      const content = _readFileSync!(pathOrConfig, "utf-8");
      raw = parseYaml(content);
    } catch (e: any) {
      if (e.code === "MODULE_NOT_FOUND" || e.code === "ERR_MODULE_NOT_FOUND") {
        throw new Error(
          `[Corral] File-path config loading is not available in this runtime. ` +
            `Pass a config object or YAML string instead.`,
        );
      }
      throw e;
    }
  }
  const resolved = resolveEnvVars(raw);
  return corralConfigSchema.parse(resolved);
}

/**
 * Async config loader — reads a file path without blocking.
 * Preferred in serverless environments where you still need file loading
 * (e.g., Node.js-based serverless like Vercel Functions).
 */
export async function loadConfigAsync(pathOrConfig: string | Record<string, unknown>): Promise<CorralConfig> {
  if (typeof pathOrConfig === "object") {
    return loadConfig(pathOrConfig);
  }
  if (pathOrConfig.trim().startsWith("{") || pathOrConfig.includes("\n")) {
    return loadConfig(pathOrConfig);
  }
  // File path — async read
  const { readFile } = await import("node:fs/promises");
  const content = await readFile(pathOrConfig, "utf-8");
  const raw = parseYaml(content);
  const resolved = resolveEnvVars(raw);
  return corralConfigSchema.parse(resolved);
}
