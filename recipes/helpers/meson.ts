//! Meson build profile helper.
//!
//! Provides the standard environment and preamble for building packages with
//! Meson + Ninja, on top of the C toolchain profile from c.ts.
//!
//! Usage:
//!   import { mesonProfile } from "../helpers/meson.js";
//!   shellBuild({
//!     ...mesonProfile(),
//!     deps: [
//!       dep("source", mySource),
//!       dep("toolchain", nativeToolchainRecipe),
//!       dep("meson", mesonRecipe),
//!       dep("ninja", ninjaRecipe),
//!       // additional deps...
//!     ],
//!     script: `
//!       meson setup builddir --prefix=/
//!       ninja -C builddir
//!       DESTDIR=$OUT ninja -C builddir install
//!     `,
//!   });
//!
//! mesonProfile() extends cProfile() with:
//!   - MESON env var pointing at /deps/meson/bin/meson
//!   - NINJA env var pointing at /deps/ninja/bin/ninja
//!   - meson and ninja bin directories on PATH

import {
  depSubpath,
  pathList,
} from "../../js/src/index.js";
import { cProfile, type CProfileOptions } from "./c.js";
import type { ShellBuildOptions } from "../../js/src/shell.js";

export interface MesonProfileOptions extends CProfileOptions {
  /** Dep name for the meson package (default: "meson"). */
  meson?: string;

  /** Dep name for the ninja package (default: "ninja"). */
  ninja?: string;
}

/**
 * Return shellBuild options for a Meson-based C/C++ build.
 *
 * Extends cProfile() with Meson and Ninja on PATH and in the environment.
 */
export function mesonProfile(opts: MesonProfileOptions = {}): Partial<ShellBuildOptions> {
  const ms = opts.meson ?? "meson";
  const nj = opts.ninja ?? "ninja";

  // Get the base C profile
  const base = cProfile(opts);

  // Extend PATH with meson and ninja bin directories
  const existingPath = (base.env as Record<string, string>).PATH ?? "";
  const extendedPath = pathList([
    depSubpath(ms, "bin"),
    depSubpath(nj, "bin"),
    ...(existingPath ? existingPath.split(":") : []),
  ]);

  const env: Record<string, string> = {
    ...(base.env as Record<string, string>),
    PATH: extendedPath,
    MESON: depSubpath(ms, "bin/meson"),
    NINJA: depSubpath(nj, "bin/ninja"),
  };

  return {
    ...base,
    env,
  };
}
