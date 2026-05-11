//! strace native build recipe — Linux syscall tracer.
//!
//! Builds strace 7.0. Zero dependencies beyond the toolchain. Standard autotools
//! build. Dynamically links glibc from the toolchain (relocated via runtime_deps).
//!
//! Optional deps (libdw, libunwind, libselinux) not included — not needed for
//! core strace functionality. mpers (multilib personality support) disabled to
//! avoid needing 32-bit headers.
//!
//! Output provides: strace.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { straceSourceRecipe } from "./strace-source.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile(),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

# Configure: disable mpers (no 32-bit headers), no optional deps.
# CC_FOR_BUILD=$CC avoids a second compiler search that fails in the sandbox.
./configure \\
  --prefix=/ \\
  --disable-dependency-tracking \\
  --disable-mpers \\
  --without-libdw \\
  --without-libunwind \\
  --without-libiberty \\
  --without-libselinux \\
  CC_FOR_BUILD="$CC"

make -j$(nproc)
make install DESTDIR=$OUT

# Strip binary
/deps/toolchain/bin/strip $OUT/bin/strace 2>/dev/null || true

# Clean up - remove docs, man pages, la files
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/share $OUT/lib/*.la 2>/dev/null || true
`,
  deps: [
    dep("source", straceSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const straceRecipe = recipe;
