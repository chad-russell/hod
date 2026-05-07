//! readline native build recipe — GNU line-editing library.
//!
//! Builds GNU readline 8.3 with shared library output. Readline provides
//! command-line editing, history recall, and completion — it's the library
//! behind bash's interactive line editing and is required by Python's
//! readline module.
//!
//! Dependencies:
//!   - ncurses (shared lib, for terminal capabilities)
//!   - toolchain (glibc, relocated via runtime_deps)

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { ncursesRecipe } from "../ncurses/ncurses.js";
import { readlineSourceRecipe } from "./readline-source.js";

const recipe = await shellBuild({
  toolchain: "toolchain",
  script: `

# Extract source
tar xf /deps/source/source -C /tmp
cd /tmp/readline-8.3

# Point to ncurses headers and libraries
export CFLAGS="$CFLAGS -I/deps/ncurses/include -I/deps/ncurses/include/ncursesw"
export LDFLAGS="$HOD_DUMMY_RPATH -L/deps/ncurses/lib"

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --with-curses

make -j$(nproc) SHLIB_LIBS="-L/deps/ncurses/lib -lncursesw"
make install DESTDIR=$OUT

# Strip shared libraries
for f in $OUT/lib/lib*.so.*.*.*; do
  /deps/toolchain/bin/strip "$f" 2>/dev/null || true
done

# Clean up — keep lib/pkgconfig, headers, .so symlinks for downstream deps
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/lib/*.la 2>/dev/null || true
rmdir $OUT/share 2>/dev/null || true`,
  deps: [
    dep("source", readlineSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("ncurses", ncursesRecipe),
  ],
  runtime_deps: ["ncurses", "toolchain"],
});

await importToStore(recipe);
export const readlineRecipe = recipe;
