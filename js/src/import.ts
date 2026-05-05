//! Import helpers — read existing .hod or .json recipe files.

import { decode, encode } from "./cli.js";
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

  // We need the recipe hash — re-encode to get it.
  // (Alternatively, we could hash the raw .hod bytes, but encodeJson
  // requires the JSON form. Since the .hod bytes are already on disk,
  // we can read them and hash directly.)
  //
  // Actually, the simplest approach: read the .hod bytes and hash them.
  // But hashing is done by hod, not in TS. Let's use a temp file approach:
  // Write JSON to temp, encode it, get hash.
  //
  // But wait — we can just use the file directly with `hod encode` by
  // writing the JSON to a temp file. OR we can note that the hash of a .hod
  // file IS the recipe hash, so we can just hash the .hod file.
  //
  // Let's use `hod hash-file` on the .hod file itself:
  const { hashFile } = await import("./cli.js");
  const hash = await hashFile(path);

  return { hash, json };
}

/**
 * Import a recipe from an existing `.json` file.
 *
 * Shells out to `hod encode` to get the recipe hash.
 */
export async function fromJson(path: string): Promise<BuiltRecipe> {
  const { readFileSync } = await import("fs");
  const jsonString = readFileSync(path, "utf-8");
  const json = JSON.parse(jsonString);

  const hash = await encode(path);
  return { hash, json };
}
