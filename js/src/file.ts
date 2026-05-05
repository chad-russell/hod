//! File recipe constructor.
//!
//! Creates a File recipe from a file on disk.

import { hashFile, encodeJson } from "./cli.js";

/** A recipe that has been encoded and has a known hash. */
export interface BuiltRecipe {
  /** BLAKE3 hex hash of the encoded .hod bytes. */
  hash: string;
  /** The JSON object (for inspection, debugging, or writing to disk). */
  json: object;
}

export interface FileFromPathOptions {
  /** Whether the file should be marked executable. Default: false. */
  executable?: boolean;
}

/**
 * Create a File recipe from a file on disk.
 *
 * Shells out to `hod hash-file` to get the content blob hash,
 * then to `hod encode` to get the recipe hash.
 */
export async function fileFromPath(
  path: string,
  options?: FileFromPathOptions,
): Promise<BuiltRecipe> {
  const contentBlobHash = await hashFile(path);
  const executable = options?.executable ?? false;

  const json = {
    type: "file",
    content_blob_hash: contentBlobHash,
    executable,
  };

  const hash = await encodeJson(json);
  return { hash, json };
}
