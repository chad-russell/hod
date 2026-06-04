//! nano native build recipe — GNU nano text editor.
//!
//! Builds nano 9.0 with shared ncursesw. Standard autotools build. Dynamically
//! links shared ncursesw and glibc from the toolchain (both relocated via runtime_deps).
//!
//! Note: libmagic (from the file package) was attempted but configure's AC_CHECK_LIB
//! test fails because libmagic transitively depends on zlib/bz2/xz which aren't in
//! the test link. Nano works fine without it — syntax highlighting uses file extension
//! matching instead of content-based detection.
//!
//! Dependencies:
//!   - ncurses (terminal handling) — shared lib

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { ncursesRecipe } from "../ncurses/ncurses.js";
import { nanoSourceRecipe } from "./nano-source.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_BINARIES } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["ncurses"],
    includePaths: ["/deps/ncurses/include/ncursesw"],
    libDeps: ["ncurses"],
  }),
  sourceDir: true,
  script: `
# Set flags for ncurses (both include paths needed for ncurses_dll.h resolution)
export CPPFLAGS="-I/deps/ncurses/include -I/deps/ncurses/include/ncursesw"
export LDFLAGS="$HOD_DUMMY_RPATH -L/deps/ncurses/lib"

./configure \\
  --prefix=/ \\
  --enable-color \\
  --enable-nanorc \\
  --enable-multibuffer \\
  --disable-nls \\
  --disable-dependency-tracking

make -j$(nproc)
make install DESTDIR=$OUT

${STRIP_BINARIES}
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/share/locale 2>/dev/null || true
`,
  deps: [
    dep("source", nanoSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("ncurses", ncursesRecipe),
  ],
  runtime_deps: ["ncurses", "toolchain"],
});

await importToStore(recipe);
export const nanoRecipe = recipe;
