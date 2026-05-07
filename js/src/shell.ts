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

// Long dummy RUNPATH that reserves space in the ELF for store-relative
// relocation patching by src/relocate.rs.  Must be long enough to hold any
// store-relative path the relocation system generates (roughly
// "$ORIGIN/../../../xx/<64-hex-chars>/lib" ≈ 88 chars per runtime dep,
// plus ~15 chars for the self-referencing $ORIGIN/../lib path).
// We use a generous length to cover 6+ runtime deps plus the self path.
// Total ≈ 15 + 88*6 + 6 = 549 chars; we reserve ~600 to be safe.
const DUMMY_RUNPATH =
  "/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/dummy";

/**
 * Build a standard shell-driven Process recipe using `/deps/<toolchain>/bin/busybox`.
 *
 * Automatically injects:
 *   - Standard toolchain environment (CC, AR, RANLIB, STRIP, CFLAGS, PATH)
 *     pointing at `/deps/<toolchain>/bin`.  Override by re-exporting in script.
 *   - A long dummy RUNPATH (-Wl,-rpath) in LDFLAGS so that dynamically-linked
 *     output binaries can be patched by the store-relative relocation pass
 *     (triggered by `runtime_deps`).  If the recipe script sets its own
 *     LDFLAGS, it MUST include `$HOD_DUMMY_RPATH` to reserve ELF space.
 *
 * For fully-static builds (no PT_INTERP), the dummy RPATH is harmlessly ignored
 * by the linker — it only matters for dynamically-linked outputs.
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

  // Inject standard toolchain environment variables (CC, AR, RANLIB, STRIP,
  // CFLAGS, PATH).  Recipes can override these by re-exporting in their script.
  const tc = opts.toolchain;
  const toolchainPreamble = `export PATH=/deps/${tc}/bin
export CC="/deps/${tc}/bin/gcc --sysroot=/deps/${tc}/sysroot -B/deps/${tc}/bin"
export AR=/deps/${tc}/bin/ar
export RANLIB=/deps/${tc}/bin/ranlib
export STRIP=/deps/${tc}/bin/strip
export CFLAGS="-O2"`;

  // Inject dummy RUNPATH into the build environment.  Export LDFLAGS prepended
  // with the dummy RPATH.  If the recipe script sets its own LDFLAGS, those
  // will override this export — so the script MUST include the dummy RPATH
  // itself (or use the HOD_DUMMY_RPATH variable) if it overrides LDFLAGS.
  const rpathPreamble = `export HOD_DUMMY_RPATH="-Wl,-rpath,${DUMMY_RUNPATH}"
export LDFLAGS="\${HOD_DUMMY_RPATH}"`;

  const fullScript = `set -e\n\n${preamble}\n${toolchainPreamble}\n${rpathPreamble}\n\n${opts.script}`;

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
