//! zlib native build recipe — shared + static library built with the native toolchain.
//!
//! Builds zlib 1.3.1 with shared library output (libz.so*) and static library.
//! Shared libraries use store-relative RUNPATH via runtime_deps for glibc.
//! Downstream packages link against the shared lib via pkg-config.
import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { zlibSourceRecipe } from "./zlib-source.js";

const recipe = await shellBuild({
  toolchain: "toolchain",
  script: `

tar xf /deps/source/source -C /tmp
cd /tmp/zlib-1.3.1

# Build shared + static (zlib's configure enables both by default without --static)
./configure --prefix=/

make -j$(nproc)
make install DESTDIR=$OUT

# Strip shared library and static archive
/deps/toolchain/bin/strip $OUT/lib/libz.so.*.*.* 2>/dev/null || true

# Clean up — keep lib/pkgconfig, headers, .so symlinks, .a for downstream
rm -rf $OUT/share $OUT/lib/*.la 2>/dev/null || true`,
  deps: [
    dep("source", zlibSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const zlibRecipe = recipe;
