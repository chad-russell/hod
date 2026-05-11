//! tree native build recipe — recursive directory listing utility.
//!
//! Builds tree 2.3.2. Zero dependencies beyond the toolchain. Simple Makefile
//! build (no configure). Dynamically links glibc from the toolchain (relocated
//! via runtime_deps).
//!
//! Output provides: the `tree` binary.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { treeSourceRecipe } from "./tree-source.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile(),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

# Build using upstream Makefile. CC, CFLAGS, LDFLAGS are auto-injected by
# shellBuild. Override PREFIX and DESTDIR for staging install.
make -j$(nproc)

# Install to staging directory. The tree Makefile uses DESTDIR as the install
# directory directly (not a staging prefix), so set it to $OUT/bin.
make install PREFIX=/ DESTDIR=$OUT/bin

# Strip binary
/deps/toolchain/bin/strip $OUT/bin/tree 2>/dev/null || true

# Clean up - remove man pages
rm -rf $OUT/share $OUT/man 2>/dev/null || true
`,
  deps: [
    dep("source", treeSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const treeRecipe = recipe;
