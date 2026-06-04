//! expat native build recipe — stream-oriented C XML parser library.
//!
//! Builds expat 2.7.1 with shared + static library output. Standalone build
//! (no dependencies beyond toolchain). Provides libexpat needed by git (HTTP),
//! dbus, fontconfig, etc. Dynamically links glibc (relocated via runtime_deps).

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { expatSourceRecipe } from "./expat-source.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile({ cxx: true }),
  sourceDir: true,
  script: `
./configure \
  --prefix=/ \
  --enable-shared \
  --enable-static \
  --without-docbook \
  --without-examples \
  --without-tests \
  --disable-dependency-tracking

make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
rm -rf $OUT/lib/cmake 2>/dev/null || true
rmdir $OUT/share 2>/dev/null || true
`,
  deps: [
    dep("source", expatSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const expatRecipe = recipe;
