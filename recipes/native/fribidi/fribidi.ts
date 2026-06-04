//! fribidi build recipe — Unicode bidirectional text library.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { fribidiSourceRecipe } from "./fribidi-source.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { mesonProfile } from "../../helpers/meson.js";
import { RELOCATE_PKG_CONFIG, STRIP_ALL } from "../../helpers/strip.js";

export const fribidiRuntimeDeps = ["toolchain"];

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
  -Ddocs=false \
  -Dtests=false \
  -Dbin=true

ninja -C build
DESTDIR=$OUT ninja -C build install

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", fribidiSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
    dep("zlib", zlibRecipe),
  ],
  runtime_deps: fribidiRuntimeDeps,
});

await importToStore(recipe);
export const fribidiRecipe = recipe;
