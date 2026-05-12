//! patchelf native build recipe — ELF binary modification utility.
//!
//! Builds patchelf 0.15.0. Dependencies: toolchain, autoconf, automake,
//! m4, perl (for autoreconf bootstrap).
//!
//! patchelf modifies existing ELF executables — changing the interpreter
//! (RPATH/RUNPATH), soname, and other dynamic section fields. It is a
//! single C++ binary with no external library dependencies beyond glibc.
//!
//! ## Build approach
//!
//! The GitHub source tarball does not include a pre-generated `configure`
//! script. We run `bootstrap.sh` (which calls `autoreconf`) to generate
//! it, then use the standard autotools build flow.
//!
//! Version 0.15.0 is used instead of 0.18.0 because 0.18.0 requires
//! C++17 which GCC 11.2.1 in the toolchain doesn't fully support.
//!
//! ## Runtime dependencies
//!
//! patchelf is a single dynamically-linked C++ binary that needs the C
//! toolchain's runtime (libc, libgcc_s, ld-linux).

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { patchelfSourceRecipe } from "./patchelf-source.js";
import { autoconfRecipe } from "../autoconf/autoconf.js";
import { automakeRecipe } from "../automake/automake.js";
import { m4Recipe } from "../m4/m4.js";
import { perlRecipe } from "../perl/perl.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile({ binDeps: ["autoconf", "automake", "m4", "perl"] }),
  script: `

# Copy source to writable directory (autoreconf needs to write autom4te.cache)
cp -a /deps/source/. /tmp/build
cd /tmp/build

# Set PERL5LIB so autoreconf's underlying autom4te can find Perl modules
export PERL5LIB="/deps/perl/lib/perl5/5.40.0:/deps/perl/lib/perl5/5.40.0/x86_64-linux"

# Generate configure from configure.ac
bash ./bootstrap.sh

# g++ needs to find glibc headers (features.h) in the sysroot
export CXXFLAGS="-O2 --sysroot=/deps/toolchain/sysroot -I/deps/toolchain/sysroot/include"

./configure \\
  --prefix=/

make -j$(nproc)
make install DESTDIR=$OUT

# Strip binary
find $OUT/bin -type f -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true

# Clean up
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/share/aclocal 2>/dev/null || true
`,
  deps: [
    dep("source", patchelfSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("autoconf", autoconfRecipe),
    dep("automake", automakeRecipe),
    dep("m4", m4Recipe),
    dep("perl", perlRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const patchelfRecipe = recipe;
