//! seatd build recipe — seat management daemon and library.
//!
//! Builds seatd 0.9.3, a minimal seat management daemon and libseat library.
//! libseat provides a seat abstraction for Wayland compositors like cosmic-comp.
//!
//! We build with:
//! - libseat-seatd=enabled (client-side seatd support)
//! - libseat-logind=disabled (no systemd/elogind dependency)
//! - libseat-builtin=enabled (embedded seatd server for standalone operation)
//! - server=enabled (seatd daemon binary)
//!
//! Dependencies at runtime: toolchain (glibc).
//! Build-time only: meson, ninja.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { seatdSourceRecipe } from "./seatd-source.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const seatdRuntimeDeps = ["toolchain"];

const recipe = await shellBuild({
  ...mesonProfile(),
  sourceDir: true,
  script: `

# Disable werror (treats warnings as errors, may fail with newer compilers)
meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Dwerror=false \\
  -Dlibseat-logind=disabled \\
  -Dlibseat-seatd=enabled \\
  -Dlibseat-builtin=enabled \\
  -Dserver=enabled \\
  -Dexamples=disabled \\
  -Dman-pages=disabled

ninja -C build
DESTDIR=$OUT ninja -C build install

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", seatdSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
    dep("zlib", zlibRecipe),
  ],
  runtime_deps: seatdRuntimeDeps,
});

await importToStore(recipe);
export const seatdRecipe = recipe;
