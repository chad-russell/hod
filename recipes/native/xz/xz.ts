//! xz (liblzma) native build recipe — XZ Utils compression library and tools.
//!
//! Builds xz-utils 5.8.3, providing liblzma (shared + static library) and the
//! xz/xzdec command-line compression/decompression utilities. liblzma
//! is required by Python's lzma module and many other packages that
//! handle .xz and .lzma compressed data.
//!
//! No dependencies beyond the toolchain. Uses autotools (configure/make).
//! Dynamically links glibc from the toolchain (relocated via runtime_deps).

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { xzSourceRecipe } from "./xz-source.js";

const recipe = await shellBuild({
  toolchain: "toolchain",
  script: `

# Extract source
tar xf /deps/source/source -C /tmp
cd /tmp/xz-5.8.3

# Configure: shared + static, no NLS, no docs
./configure \\
  --prefix=/ \\
  --enable-shared \\
  --enable-static \\
  --disable-nls \\
  --disable-doc \\
  --disable-dependency-tracking

make -j$(nproc)
make install DESTDIR=$OUT

# Strip binaries
/deps/toolchain/bin/strip $OUT/bin/xz $OUT/bin/xzdec $OUT/bin/lzmadec $OUT/bin/lzmainfo 2>/dev/null || true
/deps/toolchain/bin/strip $OUT/lib/liblzma.so.*.*.* 2>/dev/null || true

# Replace absolute symlinks with relative ones
cd $OUT/bin
ln -sf xz unxz
ln -sf xz lzma
ln -sf xz unlzma
ln -sf xz lzcat
ln -sf xz xzcat

# Clean up — keep lib/pkgconfig and headers for downstream deps
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/lib/*.la 2>/dev/null || true
# Remove share/ only if nothing useful remains
rmdir $OUT/share 2>/dev/null || true`,
  deps: [
    dep("source", xzSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const xzRecipe = recipe;
