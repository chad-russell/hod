//! Convenience helper for shell-driven build recipes.
//!
//! This is a thin wrapper over process() that handles the shell invocation
//! and preamble injection. Build-system-specific environment (CC, PATH,
//! LDFLAGS, etc.) is provided via the `env` and `preamble` fields — use
//! a profile helper (e.g., cProfile from helpers/c.ts) to supply defaults.

import type { ProcessDependency } from "./dep.js";
import type { BuiltRecipe } from "./file.js";
import { process, type EnvEntry } from "./process.js";

export interface ShellBuildOptions {
  /** Absolute sandbox path to the shell binary (e.g., "/deps/toolchain/bin/busybox"). */
  shell: string;

  /** Shell script to execute. */
  script: string;

  /**
   * Auto-copy source dependency to a build directory and cd into it.
   *
   * - `true` or `"/tmp/build"` (default when set): copies `/deps/source/.`
   *   to `/tmp/build` and cds there before running `script`.
   * - A custom path: copies to that path instead.
   * - `false` or undefined: no auto-copy (caller handles source setup).
   */
  sourceDir?: string | boolean;

  /** Optional setup commands injected before the script (e.g., linker symlinks). */
  preamble?: string;

  /** Environment variables for the build process. */
  env?: Record<string, string> | EnvEntry[];

  /** Named dependencies mounted at /deps/<name>/. */
  deps: ProcessDependency[];

  /** Runtime dependency names for store-relative ELF relocation. */
  runtime_deps?: string[];

  /** Optional working directory contents hash. */
  workdir_hash?: string;

  /** Optional initial output directory contents hash. */
  output_scaffold_hash?: string;

  /** Bitmask of unsafe_flags. Bit 0 = allow networking. */
  unsafe_flags?: number;
}

/**
 * Build a shell-driven Process recipe.
 *
 * Concatenates the optional source copy, preamble, and user script, wraps in
 * `set -e`, and delegates to process(). When `sourceDir` is set, the source
 * dependency is auto-copied to a build directory before the script runs.
 * All build environment setup (PATH, CC, LDFLAGS, linker symlinks, etc.) is
 * the caller's responsibility via the `preamble` and `env` fields.
 *
 * Use a profile helper for common build systems:
 *
 * ```ts
 * import { cProfile } from "../helpers/c.js";
 * shellBuild({
 *   ...cProfile(),
 *   sourceDir: true,
 *   deps: [dep("source", src), dep("toolchain", tc)],
 *   runtime_deps: ["toolchain"],
 *   script: `./configure --prefix=/ && make && make install`,
 * });
 * ```
 */
export async function shellBuild(opts: ShellBuildOptions): Promise<BuiltRecipe> {
  if (!opts.shell || opts.shell.trim() === "") {
    throw new Error("shellBuild(): shell is required");
  }
  if (!opts.script || opts.script.trim() === "") {
    throw new Error("shellBuild(): script is required");
  }

  const dir = opts.sourceDir === true ? "/tmp/build"
    : opts.sourceDir === false || opts.sourceDir === undefined ? null
    : opts.sourceDir;

  const sourceSetup = dir
    ? `mkdir -p ${dir} && cp -a /deps/source/. ${dir} && cd ${dir}`
    : "";

  const fullScript = [
    "set -e",
    sourceSetup ? `\n${sourceSetup}` : "",
    opts.preamble ? `\n${opts.preamble}` : "",
    `\n${opts.script}`,
  ].join("");

  return await process({
    platform: "x86_64-linux",
    command: opts.shell,
    args: ["sh", "-c", fullScript],
    env: opts.env,
    dependencies: opts.deps,
    runtime_deps: opts.runtime_deps,
    workdir_hash: opts.workdir_hash,
    output_scaffold_hash: opts.output_scaffold_hash,
    unsafe_flags: opts.unsafe_flags,
  });
}
