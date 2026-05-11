//! fetchTarball — download and extract a source tarball in one step.
//!
//! Composes `download()` and `unpack()` into a single convenience function.
//! The result is a `BuiltRecipe` (Unpack type) that:
//!   1. Downloads the archive (via the Download recipe dependency)
//!   2. Extracts it on the host (no sandbox needed)
//!
//! Usage:
//!   const source = await fetchTarball({
//!     url: "https://example.com/foo-1.0.tar.gz",
//!     hash: "<blake3 hex of the tarball>",
//!   });
//!   // source is a BuiltRecipe whose output is the extracted directory tree.

import { download } from "./download.js";
import { unpack } from "./unpack.js";
import { importToStore } from "./import.js";
import type { BuiltRecipe } from "./file.js";
import type { ArchiveFormat } from "./unpack.js";

export interface FetchTarballOptions {
  /** URL to fetch the tarball from. */
  url: string;
  /** Expected BLAKE3 hash of the tarball content (64 hex chars). */
  hash: string;
  /** Archive format. Auto-detected from URL extension if omitted. */
  format?: ArchiveFormat;
  /** Number of leading path components to strip. Default: 1 (strip top-level directory). */
  stripComponents?: number;
}

/** Mapping from URL file extensions to archive formats. */
const EXTENSION_FORMAT_MAP: [RegExp, ArchiveFormat][] = [
  [/\.tar\.gz$/i, "tar_gz"],
  [/\.tgz$/i, "tar_gz"],
  [/\.tar\.xz$/i, "tar_xz"],
  [/\.txz$/i, "tar_xz"],
  [/\.tar\.bz2$/i, "tar_bz2"],
  [/\.tbz2$/i, "tar_bz2"],
];

/**
 * Infer the archive format from a URL's filename extension.
 * Returns undefined if the extension doesn't match a known format.
 */
function inferFormat(url: string): ArchiveFormat | undefined {
  // Strip query string and fragment
  const path = new URL(url).pathname;
  for (const [re, fmt] of EXTENSION_FORMAT_MAP) {
    if (re.test(path)) return fmt;
  }
  return undefined;
}

/**
 * Download and extract a source tarball.
 *
 * Creates two linked recipes:
 *   1. A Download recipe that fetches the tarball blob
 *   2. An Unpack recipe that extracts the blob on the host
 *
 * The Unpack recipe references the Download as a build dependency,
 * so the build system ensures the blob is available before extraction.
 *
 * @param options.url   URL to fetch the tarball from.
 * @param options.hash  Expected BLAKE3 hash of the tarball (64 hex chars).
 * @param options.format Archive format. Inferred from URL extension if omitted.
 * @returns The Unpack recipe (a BuiltRecipe whose output is the extracted directory).
 */
export async function fetchTarball(options: FetchTarballOptions): Promise<BuiltRecipe> {
  const format = options.format ?? inferFormat(options.url);
  if (!format) {
    throw new Error(
      `fetchTarball(): cannot infer archive format from URL "${options.url}". ` +
      `Please specify format explicitly (e.g. { format: "tar_gz" }).`,
    );
  }

  if (!["tar_gz", "tar_xz"].includes(format)) {
    throw new Error(
      `fetchTarball(): unsupported format "${format}". Only "tar_gz" and "tar_xz" are currently supported.`,
    );
  }

  // 1. Create the Download recipe and import it to the store
  const dl = await download({ url: options.url, hash: options.hash });
  await importToStore(dl);

  // 2. Create the Unpack recipe, linking it to the Download via archive_recipe_hash
  const result = await unpack({
    archive_hash: options.hash, // blob content hash = download's expected_hash
    format,
    archive_recipe_hash: dl.hash, // DAG dependency on the Download recipe
    strip_components: options.stripComponents ?? 1, // strip top-level directory by default
  });
  await importToStore(result);

  return result;
}
