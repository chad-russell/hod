//! libevdev build recipe — evdev event handling library.
//!
//! Builds libevdev 1.9.1, a wrapper library for evdev devices.
//! Provides an API to read and interpret evdev events from kernel input devices.
//!
//! Dependencies at runtime: toolchain (glibc).
//! Build-time only: meson, ninja, python.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libevdevSourceRecipe } from "./libevdev-source.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const libevdevRuntimeDeps = ["toolchain"];

const recipe = await shellBuild({
  ...mesonProfile({ python: "python" }),
  sourceDir: true,
  script: `
export LD_LIBRARY_PATH="/deps/zlib/lib\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Dtests=disabled \\
  -Ddocumentation=disabled

ninja -C build
DESTDIR=$OUT ninja -C build install

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", libevdevSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
    dep("zlib", zlibRecipe),
  ],
  runtime_deps: libevdevRuntimeDeps,
});

await importToStore(recipe);
export const libevdevRecipe = recipe;
