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
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile(),
  sourceDir: true,
  script: `

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

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}

# Replace absolute symlinks with relative ones
cd $OUT/bin
ln -sf xz unxz
ln -sf xz lzma
ln -sf xz unlzma
ln -sf xz lzcat
ln -sf xz xzcat
`,
  deps: [
    dep("source", xzSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const xzRecipe = recipe;
