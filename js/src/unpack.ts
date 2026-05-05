//! Unpack recipe constructor.
//!
//! Creates an Unpack recipe from a known archive hash and format.

import { encodeJson } from "./cli.js";
import type { BuiltRecipe } from "./file.js";

export type ArchiveFormat = "tar_gz" | "tar_xz";

export interface UnpackOptions {
  /** BLAKE3 hash of the archive blob (64 hex characters). */
  archive_hash: string;
  /** Archive format. */
  format: ArchiveFormat;
}

/**
 * Create an Unpack recipe.
 *
 * @param options.archive_hash  BLAKE3 hash of the archive blob (64 hex chars).
 * @param options.format        Archive format (`"tar_gz"` or `"tar_xz"`).
 */
export async function unpack(options: UnpackOptions): Promise<BuiltRecipe> {
  if (!/^[0-9a-f]{64}$/.test(options.archive_hash)) {
    throw new Error(
      `unpack(): invalid hash "${options.archive_hash}". Expected a 64-character hex string.`,
    );
  }

  const validFormats: ArchiveFormat[] = ["tar_gz", "tar_xz"];
  if (!validFormats.includes(options.format)) {
    throw new Error(
      `unpack(): invalid format "${options.format}". Expected one of: ${validFormats.join(", ")}.`,
    );
  }

  const json = {
    type: "unpack",
    archive_hash: options.archive_hash,
    format: options.format,
  };

  const hash = await encodeJson(json);
  return { hash, json };
}
