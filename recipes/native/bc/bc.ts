//! bc native build recipe — GNU arbitrary-precision calculator.
//!
//! Builds GNU bc 1.08.2 (and dc 1.5.2). The Linux kernel build requires `bc`
//! for time-constant generation (`kernel/time/timeconst.bc`).
//!
//! Built without readline (bc is used non-interactively by the kernel build;
//! readline would require flex as a build-time executable dep, and flex is
//! dynamically linked and can't run inside the sandbox).
//!
//! Dependencies:
//!   - toolchain (glibc, relocated via runtime_deps)
//!   - flex (build-time lexer generator — used via store-mount for header/libs)
//!   - bison (build-time parser generator)

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { flexRecipe } from "../flex/flex.js";
import { bisonRecipe } from "../bison/bison.js";
import { bcSourceRecipe } from "./bc-source.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_BINARIES } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile({ binDeps: ["bison", "flex"] }),
  sourceDir: true,
  script: `
# Point configure to flex and bison
export PATH="/deps/flex/bin:/deps/bison/bin:$PATH"

./configure \\
  --prefix=/ \\
  --without-readline \\
  --without-libedit \\
  --disable-nls

make -j$(nproc) MAKEINFO=true
make install DESTDIR=$OUT MAKEINFO=true

# Strip binaries
${STRIP_BINARIES}

# Clean up
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/lib/*.la 2>/dev/null || true
rmdir $OUT/share 2>/dev/null || true
`,
  deps: [
    dep("bison", bisonRecipe),
    dep("flex", flexRecipe),
    dep("source", bcSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const bcRecipe = recipe;
