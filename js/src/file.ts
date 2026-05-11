//! File recipe constructor.
//!
//! Creates a File recipe from a file on disk.

import { hashFile, importBlob, encodeJson } from "./cli.js";

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
  /** Optional: hash of a Directory recipe providing packed resources. */
  resources_hash?: string;
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
 * This hashes the file, imports the blob into the store (idempotent), encodes
 * the File recipe, and returns the result. The blob is guaranteed to be in the
 * store before any build attempts to use it.
 *
 * Workflow:
 *   1. `hod hash-file <path>`   → content blob hash
 *   2. `hod import-blob <path>` → ensure blob is in the store
 *   3. construct recipe JSON
 *   4. `hod encode`             → recipe hash
 */
export async function fileFromPath(
  path: string,
  options?: FileFromPathOptions,
): Promise<BuiltRecipe> {
  const contentBlobHash = await hashFile(path);
  await importBlob(path);
  const executable = options?.executable ?? false;

  const json: Record<string, unknown> = {
    type: "file",
    content_blob_hash: contentBlobHash,
    executable,
  };

  if (options?.resources_hash) {
    if (!/^[0-9a-f]{64}$/.test(options.resources_hash)) {
      throw new Error(
        `fileFromPath(): invalid resources_hash "${options.resources_hash}". Expected a 64-character hex string.`,
      );
    }
    json.resources_hash = options.resources_hash;
  }

  const hash = await encodeJson(json);
  return { hash, json };
}

/**
 * Create a File recipe from a known content hash — without a file on disk.
 *
 * **You almost certainly want `fileFromPath()` instead.** That function
 * hashes the file *and* imports the blob into the store in one step,
 * guaranteeing the blob is available at build time. `fileFromHash` only
 * records a hash in the recipe; the actual blob must already be in the store
 * (e.g. via `hod import-blob`), or be produced by a Download build step.
 * If the blob is missing, the build will fail with a "content blob not found"
 * error.
 *
 * Legitimate uses: CI pipelines where blobs were pre-seeded into the store,
 * or recipes that reference content produced by other build steps.
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
