//! bison native build recipe — GNU parser generator.
//!
//! Builds GNU Bison 3.8.2. Dependencies: m4 (built).
//! Dynamically links glibc (relocated via runtime_deps).
//!
//! Bison produces the `bison` binary and `yacc` wrapper, plus M4 skeleton
//! files in share/bison/ that are needed at build time by downstream
//! packages that use bison to generate parsers.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { bisonSourceRecipe } from "./bison-source.js";
import { m4Recipe } from "../m4/m4.js";

const recipe = await shellBuild({
  toolchain: "toolchain",
  script: `

# Extract source
tar xf /deps/source/source -C /tmp
cd /tmp/bison-3.8.2

# Make m4 discoverable by configure
export PATH="/deps/m4/bin:$PATH"
export M4="/deps/m4/bin/m4"

./configure \\
  --prefix=/ \\
  --disable-nls \\
  --disable-dependency-tracking

make -j$(nproc)
make install DESTDIR=$OUT

# Strip binaries
find $OUT/bin -type f -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true

# Patch bison to find its data files at the dep mount point.
# --prefix=/ produces references to //share/bison.
sed -i "s|//share/bison|/deps/bison/share/bison|g" $OUT/bin/bison

# Fix absolute symlinks
cd $OUT/bin
ln -sf bison yacc

# Clean up — remove docs and info. Keep share/bison (skeleton files) and share/aclocal.
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/lib/*.la 2>/dev/null || true

# Verify key outputs
ls -la $OUT/bin/bison $OUT/bin/yacc
ls -la $OUT/share/bison/skeletons/bison.m4
`,
  deps: [
    dep("source", bisonSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("m4", m4Recipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const bisonRecipe = recipe;
