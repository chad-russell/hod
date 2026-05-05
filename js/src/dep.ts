//! Dependency helper for Process recipes.

import type { BuiltRecipe } from "./file.js";

/** A named dependency entry for Process recipes. */
export interface ProcessDependency {
  name: string;
  recipe_hash: string;
}

/**
 * Create a dependency entry.
 *
 * @param name     Dependency name (mounted at `/deps/<name>/` in sandbox).
 * @param source   A `BuiltRecipe`, a 64-char hex hash string, or a path to a `.hod`/`.json` file.
 */
export function dep(name: string, source: BuiltRecipe | string): ProcessDependency {
  if (typeof source === "object" && source !== null && "hash" in source) {
    // BuiltRecipe — use its hash directly
    return { name, recipe_hash: (source as BuiltRecipe).hash };
  }

  if (typeof source === "string") {
    // Validate: 64 hex characters?
    if (/^[0-9a-f]{64}$/.test(source)) {
      return { name, recipe_hash: source };
    }
    throw new Error(
      `dep("${name}", ...): invalid hash "${source}". ` +
      `Expected a 64-character hex string or a BuiltRecipe. Use fromHod() to import .hod files.`
    );
  }

  throw new TypeError(`dep("${name}", ...): unexpected source type: ${typeof source}`);
}
