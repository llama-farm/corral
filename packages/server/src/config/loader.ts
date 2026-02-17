import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { corralConfigSchema, type CorralConfig } from "./schema.js";

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

export function loadConfig(pathOrConfig: string | Record<string, unknown>): CorralConfig {
  let raw: unknown;
  if (typeof pathOrConfig === "string") {
    const content = readFileSync(pathOrConfig, "utf-8");
    raw = parseYaml(content);
  } else {
    raw = pathOrConfig;
  }
  const resolved = resolveEnvVars(raw);
  return corralConfigSchema.parse(resolved);
}
