//! fetchGit — content-addressed git repository fetch.
//!
//! Analogous to Nix's `builtins.fetchGit`. Clones a git repository at a
//! specified revision, verifies the output hash, and produces a directory
//! tree output (without `.git` metadata).
//!
//! Usage:
//!   const source = await fetchGit({
//!     url: "https://github.com/pop-os/cosmic-comp",
//!     revision: "main",
//!     hash: "<blake3 hex of the output tree>",
//!   });
//!   // source is a BuiltRecipe whose output is the working tree at that revision.
//!
//! The output can be used as a source dependency in Process recipes, exactly
//! like fetchTarball output.

import { encodeJson } from "./cli.js";
import { importToStore } from "./import.js";
import type { BuiltRecipe } from "./file.js";

export interface FetchGitOptions {
  /** Git repository URL (HTTPS or SSH). */
  url: string;
  /** Revision to checkout — commit hash, tag, or branch name. */
  revision: string;
  /** Expected BLAKE3 hash of the output directory tree (64 hex chars). */
  hash: string;
}

/**
 * Create a GitFetch recipe that clones a git repo at a known revision.
 *
 * The build system:
 *   1. Clones the repository
 *   2. Checks out the specified revision
 *   3. Removes `.git` metadata
 *   4. Verifies the output tree hash
 *   5. Stores the result in the content-addressed store
 *
 * The output is a directory tree identical in shape to fetchTarball output.
 * It can be used as a source dependency in Process recipes.
 *
 * @param options.url      Git repository URL.
 * @param options.revision Revision (commit, tag, or branch).
 * @param options.hash     Expected BLAKE3 hash of the output tree.
 * @returns The GitFetch recipe (a BuiltRecipe).
 */
export async function fetchGit(options: FetchGitOptions): Promise<BuiltRecipe> {
  if (!/^[0-9a-f]{64}$/.test(options.hash)) {
    throw new Error(
      `fetchGit(): invalid hash "${options.hash}". Expected a 64-character hex string.`
    );
  }

  if (!options.url || options.url.trim() === "") {
    throw new Error("fetchGit(): url is required");
  }

  if (!options.revision || options.revision.trim() === "") {
    throw new Error("fetchGit(): revision is required");
  }

  const json = {
    type: "git_fetch",
    url: options.url,
    revision: options.revision,
    expected_hash: options.hash,
  };

  const hash = await encodeJson(json);
  const recipe: BuiltRecipe = { hash, json };
  await importToStore(recipe);
  return recipe;
}
