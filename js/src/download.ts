//! Download recipe constructor.
//!
//! Creates a Download recipe from a URL and expected BLAKE3 hash.

import { encodeJson } from "./cli.js";
import type { BuiltRecipe } from "./file.js";

export interface DownloadOptions {
  /** URL to fetch. */
  url: string;
  /** Expected BLAKE3 hash of the fetched content (64 hex chars). */
  hash: string;
}

/**
 * Create a Download recipe.
 *
 * @param options.url   URL to fetch.
 * @param options.hash  Expected BLAKE3 hash of the content (64 hex chars).
 */
export async function download(options: DownloadOptions): Promise<BuiltRecipe> {
  if (!/^[0-9a-f]{64}$/.test(options.hash)) {
    throw new Error(
      `download(): invalid hash "${options.hash}". Expected a 64-character hex string.`
    );
  }

  const json = {
    type: "download",
    url: options.url,
    hash_algorithm: "blake3",
    expected_hash: options.hash,
  };

  const hash = await encodeJson(json);
  return { hash, json };
}
