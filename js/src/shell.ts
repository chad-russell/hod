//! Convenience helper for common shell-driven build recipes.

import type { ProcessDependency } from "./dep.js";
import type { BuiltRecipe } from "./file.js";
import { hermeticPreamble } from "./preamble.js";
import { process, type EnvEntry } from "./process.js";

export interface ShellBuildOptions {
  /** Dependency name that provides `bin/busybox`, glibc runtime, and toolchain binaries. */
  toolchain: string;

  /** Shell script to run inside the sandbox. */
  script: string;

  /** Environment variables for the process recipe. */
  env?: Record<string, string> | EnvEntry[];

  /** Named dependencies mounted under `/deps/<name>/`. Must include `toolchain`. */
  deps?: ProcessDependency[];

  /** Runtime dependencies for ELF relocation. */
  runtime_deps?: string[];

  /** Optional working directory contents hash. */
  workdir_hash?: string;

  /** Optional initial output directory contents hash. */
  output_scaffold_hash?: string;

  /** Bitmask of unsafe flags. Bit 0 = allow networking. */
  unsafe_flags?: number;
}

function normalizeEnv(env?: Record<string, string> | EnvEntry[]): Record<string, string> {
  const merged: Record<string, string> = {
    C_INCLUDE_PATH: "",
  };

  if (!env) {
    return merged;
  }

  if (Array.isArray(env)) {
    for (const entry of env) {
      merged[entry.key] = entry.value;
    }
    return merged;
  }

  return {
    ...merged,
    ...env,
  };
}

/**
 * Build a standard shell-driven Process recipe using `/deps/<toolchain>/bin/busybox`.
 */
export async function shellBuild(opts: ShellBuildOptions): Promise<BuiltRecipe> {
  if (!opts.toolchain || opts.toolchain.trim() === "") {
    throw new Error("shellBuild(): toolchain is required");
  }
  if (!opts.script || opts.script.trim() === "") {
    throw new Error("shellBuild(): script is required");
  }

  const deps = opts.deps ?? [];
  if (!deps.some((dep) => dep.name === opts.toolchain)) {
    throw new Error(
      `shellBuild(): deps must include dep("${opts.toolchain}", ...) so /deps/${opts.toolchain}/ is available`,
    );
  }

  const preamble = hermeticPreamble({
    shell: opts.toolchain,
    glibcLinker: opts.toolchain,
  });

  const fullScript = `set -e\n\n${preamble}\n\n${opts.script}`;

  return await process({
    platform: "x86_64-linux",
    command: `/deps/${opts.toolchain}/bin/busybox`,
    args: ["sh", "-c", fullScript],
    env: normalizeEnv(opts.env),
    dependencies: deps,
    runtime_deps: opts.runtime_deps,
    workdir_hash: opts.workdir_hash,
    output_scaffold_hash: opts.output_scaffold_hash,
    unsafe_flags: opts.unsafe_flags,
  });
}
