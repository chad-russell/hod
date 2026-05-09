//! pv native build recipe — Pipe Viewer.
//!
//! Builds pv 1.10.5. Zero dependencies beyond the toolchain. Standard autotools
//! build. Dynamically links glibc from the toolchain (relocated via runtime_deps).
//!
//! Output provides: pv — a terminal-based tool for monitoring the progress of
//! data through a pipeline, with ETA, speed, and progress bars.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { pvSourceRecipe } from "./pv-source.js";

const recipe = await shellBuild({
  toolchain: "toolchain",
  script: `

# Extract source
tar xf /deps/source/source -C /tmp
cd /tmp/pv-1.10.5

# Configure: no NLS, no dependency tracking
./configure \\
  --prefix=/ \\
  --disable-nls \\
  --disable-dependency-tracking

make -j$(nproc)
make install DESTDIR=$OUT

# Strip binary
/deps/toolchain/bin/strip $OUT/bin/pv 2>/dev/null || true

# Clean up - remove docs and unneeded files
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/share 2>/dev/null || true
`,
  deps: [
    dep("source", pvSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const pvRecipe = recipe;
