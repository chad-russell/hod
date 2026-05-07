//! m4 native build recipe — GNU macro processor.
//!
//! Builds m4 1.4.19. Standalone, no dependencies beyond the toolchain.
//! Dynamically links glibc (relocated via runtime_deps).
//!
//! m4 is build infrastructure that unblocks autoconf/automake later.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { m4SourceRecipe } from "./m4-source.js";

const recipe = await shellBuild({
  toolchain: "toolchain",
  script: `

# Extract source
tar xf /deps/source/source -C /tmp
cd /tmp/m4-1.4.19

./configure \\
  --prefix=/ \\
  --disable-nls \\
  --disable-dependency-tracking

make -j$(nproc)
make install DESTDIR=$OUT

# Strip the binary
/deps/toolchain/bin/strip $OUT/bin/m4 2>/dev/null || true

# Clean up
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/share $OUT/lib/charset.alias 2>/dev/null || true
`,
  deps: [
    dep("source", m4SourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const m4Recipe = recipe;
