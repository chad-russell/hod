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

export interface FileFromHashOptions {
  /** Whether the file should be marked executable. Default: false. */
  executable?: boolean;
  /** Optional: hash of a Directory recipe providing packed resources. */
  resources_hash?: string;
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

/**
 * Create a File recipe from a known content hash (no file on disk needed).
 *
 * Use this when the content blob hash is already known — e.g. for bootstrap
 * recipes where the actual file lives in `recipes/sources/` but the hash was
 * pre-computed.
 */
export async function fileFromHash(
  content_blob_hash: string,
  options?: FileFromHashOptions,
): Promise<BuiltRecipe> {
  if (!/^[0-9a-f]{64}$/.test(content_blob_hash)) {
    throw new Error(
      `fileFromHash(): invalid hash "${content_blob_hash}". Expected a 64-character hex string.`,
    );
  }

  const json: Record<string, unknown> = {
    type: "file",
    content_blob_hash,
    executable: options?.executable ?? false,
  };

  if (options?.resources_hash) {
    if (!/^[0-9a-f]{64}$/.test(options.resources_hash)) {
      throw new Error(
        `fileFromHash(): invalid resources_hash "${options.resources_hash}". Expected a 64-character hex string.`,
      );
    }
    json.resources_hash = options.resources_hash;
  }

  const hash = await encodeJson(json);
  return { hash, json };
}
