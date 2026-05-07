//! expat native build recipe — stream-oriented C XML parser library.
//!
//! Builds expat 2.7.1 with shared + static library output. Standalone build
//! (no dependencies beyond toolchain). Provides libexpat needed by git (HTTP),
//! dbus, fontconfig, etc. Dynamically links glibc (relocated via runtime_deps).

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { expatSourceRecipe } from "./expat-source.js";

const recipe = await shellBuild({
  toolchain: "toolchain",
  script: `

# Extract source (xz format)
tar xf /deps/source/source -C /tmp
cd /tmp/expat-2.7.1

export CXX="/deps/toolchain/bin/g++ --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"
export CXXCPP="/deps/toolchain/bin/g++ --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin -E"
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

# Strip the xmlwf binary and shared library
/deps/toolchain/bin/strip $OUT/bin/xmlwf 2>/dev/null || true
/deps/toolchain/bin/strip $OUT/lib/libexpat.so.*.*.* 2>/dev/null || true

# Clean up — keep lib/pkgconfig for downstream deps
rm -rf $OUT/share/doc $OUT/share/man $OUT/lib/*.la $OUT/lib/cmake 2>/dev/null || true
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
