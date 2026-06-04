//! Unpack recipe constructor.
//!
//! Creates an Unpack recipe from a known archive hash and format.

import { encodeJson } from "./cli.js";
import type { BuiltRecipe } from "./file.js";

export type ArchiveFormat = "tar_gz" | "tar_xz" | "tar_bz2" | "zip";

export interface UnpackOptions {
  /** BLAKE3 hash of the archive blob (64 hex characters). */
  archive_hash: string;
  /** Archive format. */
  format: ArchiveFormat;
  /** Optional: recipe hash of a Download recipe that produces the archive blob.
   *  When set, the build system will build the Download first (ensuring the
   *  blob is in the store) before extracting. */
  archive_recipe_hash?: string;
  /** Number of leading path components to strip during extraction.
   *  Equivalent to `tar --strip-components=N`. Default is 0 (no stripping). */
  strip_components?: number;
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

  const validFormats: ArchiveFormat[] = ["tar_gz", "tar_xz", "tar_bz2", "zip"];
  if (!validFormats.includes(options.format)) {
    throw new Error(
      `unpack(): invalid format "${options.format}". Expected one of: ${validFormats.join(", ")}.`,
    );
  }

  const json: Record<string, unknown> = {
    type: "unpack",
    archive_hash: options.archive_hash,
    format: options.format,
  };

  if (options.archive_recipe_hash) {
    if (!/^[0-9a-f]{64}$/.test(options.archive_recipe_hash)) {
      throw new Error(
        `unpack(): invalid archive_recipe_hash "${options.archive_recipe_hash}". Expected a 64-character hex string.`,
      );
    }
    json.archive_recipe_hash = options.archive_recipe_hash;
  }

  if (options.strip_components !== undefined) {
    if (!Number.isInteger(options.strip_components) || options.strip_components < 0 || options.strip_components > 255) {
      throw new Error(
        `unpack(): invalid strip_components "${options.strip_components}". Expected an integer 0-255.`,
      );
    }
    json.strip_components = options.strip_components;
  }

  const hash = await encodeJson(json);
  return { hash, json };
}
