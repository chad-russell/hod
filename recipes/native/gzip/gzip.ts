//! gzip native build recipe — GNU gzip compression/decompression utility.
//!
//! Builds gzip 1.14. Zero dependencies beyond the toolchain. Standard autotools
//! build. Dynamically links glibc from the toolchain (relocated via runtime_deps).
//!
//! Output provides: gzip, gunzip, zcat, and various compatibility symlinks.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { gzipSourceRecipe } from "./gzip-source.js";

const recipe = await shellBuild({
  toolchain: "toolchain",
  script: `

# Extract source
tar xf /deps/source/source -C /tmp
cd /tmp/gzip-1.14

# Configure: no NLS, no docs, no dependency tracking
./configure \\
  --prefix=/ \\
  --disable-nls \\
  --disable-dependency-tracking

make -j$(nproc)
make install DESTDIR=$OUT

# Strip binaries
/deps/toolchain/bin/strip $OUT/bin/gzip 2>/dev/null || true

# Clean up - remove docs and unneeded files
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/share $OUT/lib/charset.alias 2>/dev/null || true
`,
  deps: [
    dep("source", gzipSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const gzipRecipe = recipe;
