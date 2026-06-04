//! libpng build recipe — PNG image library.
//!
//! Builds libpng 1.6.47 shared-first against zlib.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libpngSourceRecipe } from "./libpng-source.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const libpngRuntimeDeps = ["toolchain", "zlib"];

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["zlib"],
    libDeps: ["zlib"],
    pkgConfigDeps: ["zlib"],
  }),
  sourceDir: true,
  script: `
./configure \
  --prefix=/ \
  --enable-shared \
  --enable-static \
  --disable-dependency-tracking \
  --disable-tools \
  --disable-tests

make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", libpngSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("zlib", zlibRecipe),
  ],
  runtime_deps: libpngRuntimeDeps,
});

await importToStore(recipe);
export const libpngRecipe = recipe;
