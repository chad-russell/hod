//! zlib native build recipe — shared + static library built with the native toolchain.
//!
//! Builds zlib 1.3.1 with shared library output (libz.so*) and static library.
//! Shared libraries use store-relative RUNPATH via runtime_deps for glibc.
//! Downstream packages link against the shared lib via pkg-config.
import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { zlibSourceRecipe } from "./zlib-source.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_LIBRARIES, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile(),
  sourceDir: true,
  script: `

# Build shared + static (zlib's configure enables both by default without --static)
./configure --prefix=/

make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

${STRIP_LIBRARIES}
rm -rf $OUT/share $OUT/lib/*.la 2>/dev/null || true`,
  deps: [
    dep("source", zlibSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const zlibRecipe = recipe;
