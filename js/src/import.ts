//! Import helpers — read existing .hod recipe files, import recipes to store.

import { decode, importFromJson } from "./cli.js";
import type { BuiltRecipe } from "./file.js";

/**
 * Import a recipe from an existing `.hod` binary file.
 *
 * Shells out to `hod decode` to get the JSON, then parses it.
 * The JSON is the canonical representation.
 */
export async function fromHod(path: string): Promise<BuiltRecipe> {
  // Decode the .hod to get the JSON string
  const jsonString = await decode(path);
  const json = JSON.parse(jsonString);

  // The hash of a .hod file IS the recipe hash.
  const { hashFile } = await import("./cli.js");
  const hash = await hashFile(path);

  return { hash, json };
}

/**
 * Import a recipe directly into the Hod store.
 *
 * This shells out to `hod import-from-json`, piping the recipe JSON on stdin.
 * The recipe is encoded to binary and stored. No `.hod` file is left on disk.
 *
 * Returns the recipe hash (BLAKE3 hex, 64 characters).
 */
export async function importToStore(recipe: BuiltRecipe): Promise<string> {
  const hash = await importFromJson(recipe.json);
  console.log(`Imported to store: ${hash}`);
  return hash;
}
