//! flex native build recipe — Fast lexical analyzer generator.
//!
//! Builds Flex 2.6.4. Dependencies: m4 (built), bison (built).
//! Dynamically links glibc (relocated via runtime_deps).
//!
//! Flex produces the `flex` binary and `flex++` symlink, plus the shared
//! library `libfl.so` and `libfl_pic.so`. Uses --disable-bootstrap since
//! bison is available but the pre-generated parser should work fine.
//!
//! Note: shellBuild sets CC with --sysroot but does not set CXX. Since flex
//! has C++ sources, we set CXX explicitly with the same sysroot flags.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { flexSourceRecipe } from "./flex-source.js";
import { m4Recipe } from "../m4/m4.js";
import { bisonRecipe } from "../bison/bison.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_BINARIES } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile({ cxx: true, binDeps: ["m4", "bison"] }),
  sourceDir: true,
  script: `
# Make m4 and bison discoverable by configure
export PATH="/deps/m4/bin:/deps/bison/bin:$PATH"
export M4="/deps/m4/bin/m4"
export YACC="bison -y"

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --disable-nls \\
  --disable-dependency-tracking \\
  --disable-bootstrap

make -j$(nproc)
make install DESTDIR=$OUT

# Strip binaries
${STRIP_BINARIES}

# Fix symlinks to be relative
cd $OUT/bin
ln -sf flex flex++
ln -sf flex lex

# Clean up — remove docs and info. Keep lib (libfl.so for downstream).
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/lib/*.la 2>/dev/null || true

# Verify key outputs
ls -la $OUT/bin/flex $OUT/bin/flex++ $OUT/bin/lex
`,
  deps: [
    dep("source", flexSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("m4", m4Recipe),
    dep("bison", bisonRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const flexRecipe = recipe;
