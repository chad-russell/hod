//! GMP native build recipe — GNU Multiple Precision Arithmetic Library.
//!
//! Builds GMP 6.3.0 with shared + static library output. GMP provides
//! arbitrary-precision integer, rational, and floating-point arithmetic.
//! Required by MPFR and GDB (mandatory dependency).
//!
//! Build deps: m4 (macro processor, required by GMP's configure).
//! No other dependencies beyond the toolchain. Dynamically links glibc from the
//! toolchain (relocated via runtime_deps).

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { m4Recipe } from "../m4/m4.js";
import { gmpSourceRecipe } from "./gmp-source.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_LIBRARIES } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile({
    binDeps: ["m4"],
  }),
  sourceDir: true,
  script: `
./configure \\
  --prefix=/ \\
  --enable-shared \\
  --enable-static \\
  --disable-dependency-tracking

make -j$(nproc)
make install DESTDIR=$OUT

${STRIP_LIBRARIES}

# Clean up — keep lib/pkgconfig and headers for downstream deps (MPFR, GDB)
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/lib/*.la 2>/dev/null || true
rmdir $OUT/share 2>/dev/null || true
`,
  deps: [
    dep("source", gmpSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("m4", m4Recipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const gmpRecipe = recipe;
