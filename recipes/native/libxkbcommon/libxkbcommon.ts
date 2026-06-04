//! libxkbcommon build recipe — keymap handling library.
//!
//! Builds libxkbcommon 1.9.2, a keymap compiler and support library which
//! processes a reduced subset of keymaps as defined by the XKB specification.
//!
//! Dependencies: toolchain (for glibc).
//!
//! The build uses the packaged bison/m4 toolchain during Meson setup to
//! generate the parser from upstream sources.
//!
//! Disabled options:
//!   - X11 support (needs xcb-xkb)
//!   - Wayland support (only needed for utility programs)
//!   - xkbregistry (needs libxml-2.0)
//!   - Tools (not needed as a library)
//!   - Docs
//!
//! xkeyboard-config is not available; the build falls back to a default path.
//! This is fine for slurp's use case (xkbcommon only handles keymap processing).

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libxkbcommonSourceRecipe } from "./libxkbcommon-source.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { bisonRecipe } from "../bison/bison.js";
import { m4Recipe } from "../m4/m4.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const libxkbcommonRuntimeDeps = ["toolchain"];

const recipe = await shellBuild({
  ...mesonProfile({ binDeps: ["bison", "m4"] }),
  sourceDir: true,
  script: `
# Python (used by meson) needs libz.so at runtime
export LD_LIBRARY_PATH="/deps/zlib/lib\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Denable-x11=false \\
  -Denable-wayland=false \\
  -Denable-xkbregistry=false \\
  -Denable-tools=false \\
  -Denable-docs=false

ninja -C build
DESTDIR=$OUT ninja -C build install

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", libxkbcommonSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
    dep("zlib", zlibRecipe),
    dep("bison", bisonRecipe),
    dep("m4", m4Recipe),
  ],
  runtime_deps: libxkbcommonRuntimeDeps,
});

await importToStore(recipe);
export const libxkbcommonRecipe = recipe;
