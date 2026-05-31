//! C toolchain build profile.
//!
//! Provides the standard environment and preamble for building C/C++ packages
//! with the native Hod toolchain (gcc-stage2 + binutils + glibc sysroot).
//!
//! Usage:
//!   import { cProfile } from "../helpers/c.js";
//!   shellBuild({ ...cProfile(), deps: [...], script: `...` });

import {
  depSubpath,
  hermeticPreamble,
  HOD_DUMMY_RPATH_FLAG,
  pathList,
} from "../../js/src/index.js";
import type { ShellBuildOptions } from "../../js/src/shell.js";

export interface CProfileOptions {
  /** Dep name for the toolchain bundle (default: "toolchain"). */
  tc?: string;
  /** Alias for tc; useful for readability at call sites. */
  toolchain?: string;

  /** Additional dependency bin directories to append to PATH, in caller order. */
  binDeps?: string[];
  /** Dependencies whose include/ directories should be added to C_INCLUDE_PATH. */
  includeDeps?: string[];
  /** Additional explicit include paths, for package-specific layouts. */
  includePaths?: string[];
  /** Dependencies whose lib/ directories should be added to LIBRARY_PATH. */
  libDeps?: string[];
  /** Additional explicit library paths. */
  libPaths?: string[];
  /** Dependencies whose pkg-config directories should be added to PKG_CONFIG_PATH.
   *   Both `lib/pkgconfig` and `share/pkgconfig` are included automatically. */
  pkgConfigDeps?: string[];
  /** Additional explicit pkg-config search paths. */
  pkgConfigPaths?: string[];

  /**
   * Dep name providing Python 3 (`bin/python3`). When set:
   * - The hermetic preamble creates `/usr/bin/env` and `/usr/bin/python3` wrapper
   * - `/usr/bin` and `/deps/<python>/bin` are added to PATH (before toolchain)
   *
   * Use this for any build that invokes Python scripts (meson, glib, etc.).
   */
  python?: string;
}

/**
 * Return shellBuild options for a standard C build.
 *
 * Sets up:
 *   - Shell: /deps/<tc>/bin/busybox
 *   - Preamble: hermetic symlinks for ld-linux + glibc shared libs
 *   - PATH: /deps/<tc>/bin plus explicit binDeps
 *   - C compiler: CC pointing at gcc --sysroot + -B for binutils
 *   - Toolchain vars: AR, RANLIB, STRIP, CFLAGS
 *   - Optional explicit C_INCLUDE_PATH, LIBRARY_PATH, LD_LIBRARY_PATH, and PKG_CONFIG_PATH
 *   - LDFLAGS + HOD_DUMMY_RPATH: dummy RUNPATH for store-relative relocation
 *
 * Both HOD_DUMMY_RPATH and LDFLAGS are set to the same literal flag string
 * so that recipes can reference $HOD_DUMMY_RPATH when constructing custom
 * LDFLAGS values:
 *
 *   script: `
 *     export LDFLAGS="$HOD_DUMMY_RPATH -L/deps/zlib/lib"
 *     ./configure ...
 *   `
 */
export function cProfile(opts: CProfileOptions = {}): Partial<ShellBuildOptions> {
  const tc = opts.toolchain ?? opts.tc ?? "toolchain";
  const rpathFlag = HOD_DUMMY_RPATH_FLAG;

  const pathEntries: string[] = [];
  // Python wrapper and bin must come first so that /usr/bin/python3
  // (the wrapper) is found before any other python3 on PATH.
  if (opts.python) {
    pathEntries.push("/usr/bin", depSubpath(opts.python, "bin"));
  }
  pathEntries.push(depSubpath(tc, "bin"));
  pathEntries.push(...(opts.binDeps ?? []).map((dep) => depSubpath(dep, "bin")));

  const env: Record<string, string> = {
    PATH: pathList(pathEntries),
    CC: `${depSubpath(tc, "bin/gcc")} --sysroot=${depSubpath(tc, "sysroot")} -B${depSubpath(tc, "bin")}`,
    AR: depSubpath(tc, "bin/ar"),
    RANLIB: depSubpath(tc, "bin/ranlib"),
    STRIP: depSubpath(tc, "bin/strip"),
    CFLAGS: "-O2",
    HOD_DUMMY_RPATH: rpathFlag,
    LDFLAGS: rpathFlag,
  };

  const includePath = pathList([
    ...(opts.includeDeps ?? []).map((dep) => depSubpath(dep, "include")),
    ...(opts.includePaths ?? []),
  ]);
  if (includePath !== "") {
    env.C_INCLUDE_PATH = includePath;
  }

  const libraryPath = pathList([
    ...(opts.libDeps ?? []).map((dep) => depSubpath(dep, "lib")),
    ...(opts.libPaths ?? []),
  ]);
  if (libraryPath !== "") {
    env.LIBRARY_PATH = libraryPath;
  }

  // Add LD_LIBRARY_PATH from libDeps so that dynamically-linked build tools
  // (e.g., clang needing libz) can find their runtime dependencies when
  // invoked by downstream recipes. This mirrors what cargoBuild does for Rust.
  if (libraryPath !== "") {
    env.LD_LIBRARY_PATH = libraryPath;
  }

  // Add both lib/pkgconfig and share/pkgconfig for each dep.
  // pkg-config silently ignores non-existent directories, so it's safe
  // to add both even if only one exists. This handles data packages
  // (xorgproto, gsettings-desktop-schemas, iso-codes, etc.) that install
  // their .pc files in share/pkgconfig instead of lib/pkgconfig.
  const pkgConfigPath = pathList([
    ...(opts.pkgConfigDeps ?? []).flatMap((dep) => [
      depSubpath(dep, "lib/pkgconfig"),
      depSubpath(dep, "share/pkgconfig"),
    ]),
    ...(opts.pkgConfigPaths ?? []),
  ]);
  if (pkgConfigPath !== "") {
    env.PKG_CONFIG_PATH = pkgConfigPath;
  }

  return {
    shell: depSubpath(tc, "bin/busybox"),
    preamble: hermeticPreamble({ shell: tc, glibcLinker: tc, python: opts.python }),
    env,
  };
}
