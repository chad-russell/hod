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
import { cProfile } from "../../helpers/c.js";
import { STRIP_BINARIES } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile(),
  sourceDir: true,
  script: `

# Configure: no NLS, no dependency tracking
./configure \\
  --prefix=/ \\
  --disable-nls \\
  --disable-dependency-tracking

make -j$(nproc)
make install DESTDIR=$OUT

${STRIP_BINARIES}
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
