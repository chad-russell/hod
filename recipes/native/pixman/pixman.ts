//! pixman build recipe — low-level pixel manipulation library.
//!
//! Builds Pixman 0.46.4 with Meson. Required by Cairo.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { pixmanSourceRecipe } from "./pixman-source.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_LIBRARIES, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const pixmanRuntimeDeps = ["toolchain"];

const recipe = await shellBuild({
  ...mesonProfile(),
  sourceDir: true,
  script: `

export LD_LIBRARY_PATH="/deps/zlib/lib\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

meson setup build \
  --prefix=/ \
  --libdir=lib \
  --buildtype=release \
  -Ddefault_library=shared \
  -Dtests=disabled \
  -Ddemos=disabled \
  -Dgtk=disabled \
  -Dlibpng=disabled \
  -Dopenmp=disabled

ninja -C build
DESTDIR=$OUT ninja -C build install

${RELOCATE_PKG_CONFIG}

${STRIP_LIBRARIES}
rm -rf $OUT/share/doc $OUT/share/man 2>/dev/null || true
`,
  deps: [
    dep("source", pixmanSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
    dep("zlib", zlibRecipe),
  ],
  runtime_deps: pixmanRuntimeDeps,
});

await importToStore(recipe);
export const pixmanRecipe = recipe;
