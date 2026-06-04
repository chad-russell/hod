//! freetype build recipe — font rendering library.
//!
//! Builds FreeType 2.13.3 with zlib, libpng, and bzip2 support.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { freetypeSourceRecipe } from "./freetype-source.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { libpngRecipe } from "../libpng/libpng.js";
import { bzip2Recipe } from "../bzip2/bzip2.js";
import { cProfile } from "../../helpers/c.js";
import { RELOCATE_PKG_CONFIG, STRIP_ALL } from "../../helpers/strip.js";

export const freetypeRuntimeDeps = ["bzip2", "libpng", "toolchain", "zlib"];

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["zlib", "libpng", "bzip2"],
    libDeps: ["zlib", "libpng", "bzip2"],
    pkgConfigDeps: ["zlib", "libpng", "bzip2"],
  }),
  sourceDir: true,
  script: `
./configure \
  --prefix=/ \
  --enable-shared \
  --disable-static \
  --with-zlib=yes \
  --with-bzip2=yes \
  --with-png=yes \
  --with-harfbuzz=no \
  --with-brotli=no

make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
rm -rf $OUT/share/aclocal 2>/dev/null || true
`,
  deps: [
    dep("source", freetypeSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("zlib", zlibRecipe),
    dep("libpng", libpngRecipe),
    dep("bzip2", bzip2Recipe),
  ],
  runtime_deps: freetypeRuntimeDeps,
});

await importToStore(recipe);
export const freetypeRecipe = recipe;
