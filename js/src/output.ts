//! Output helpers — write .hod and .json files to disk.

import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { encodeJson } from "./cli.js";
import type { BuiltRecipe } from "./file.js";

/**
 * Write the .hod binary to disk.
 * Shells out to `hod encode` with --output.
 * Returns the recipe hash.
 */
export async function writeHod(
  recipe: BuiltRecipe,
  outputPath: string,
): Promise<string> {
  const hash = await encodeJson(recipe.json, outputPath);
  return hash;
}

/**
 * Write the JSON representation to disk.
 * Pure TypeScript — no shell-out needed.
 * Returns the recipe hash.
 */
export function writeJson(recipe: BuiltRecipe, outputPath: string): string {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(recipe.json, null, 2) + "\n");
  return recipe.hash;
}
