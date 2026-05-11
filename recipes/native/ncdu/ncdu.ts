//! ncdu native build recipe — NCurses Disk Usage analyzer.
//!
//! Builds ncdu 1.22 (C/LTS version). The 2.x version is written in Zig,
//! which is not available in the current toolchain, so we use the C 1.x
//! branch which is still maintained.
//!
//! Dependencies:
//!   - ncurses (terminal handling) — shared libncursesw
//!   - toolchain (C compiler + glibc)
//!
//! Uses autotools to find ncursesw. The ncurses .pc files use pcfiledir
//! to resolve to the correct sandbox paths, so PKG_CONFIG_PATH is
//! sufficient — no manual CPPFLAGS/CFLAGS/LDFLAGS needed.
//!
//! Note: ncdu 2.x requires Zig; if a Zig toolchain is added later,
//! the recipe can be updated to build the newer version.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { ncursesRecipe } from "../ncurses/ncurses.js";
import { ncduSourceRecipe } from "./ncdu-source.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile({
    includePaths: ["/deps/ncurses/include/ncursesw"],
    libDeps: ["ncurses"],
    pkgConfigDeps: ["ncurses"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

# pkg-config provides -I/-L/-l flags from the relocatable ncurses .pc files.
# CPPFLAGS includes ncurses' ncursesw header subdirectory explicitly because
# ncdu's configure checks for <ncurses.h> before using pkg-config results.
find . -type f \\( -name '*.c' -o -name '*.h' -o -name 'configure' \\) \
  -exec sed -i 's/<ncurses\.h>/<curses.h>/g; s/ ncurses\.h/ curses.h/g' {} +
mkdir -p /tmp/ncdu-include
cp /deps/ncurses/include/ncursesw/curses.h /tmp/ncdu-include/curses.h

ac_cv_header_curses_h=yes \
CPPFLAGS="-I/tmp/ncdu-include -I/deps/ncurses/include -I/deps/ncurses/include/ncursesw" \
LDFLAGS="$HOD_DUMMY_RPATH -L/deps/ncurses/lib" \
./configure \\
  --prefix=/ \\
  --with-ncursesw

make -j$(nproc)
make install DESTDIR=$OUT

# Strip the binary
/deps/toolchain/bin/strip $OUT/bin/ncdu 2>/dev/null || true

# Remove docs
rm -rf $OUT/share/man $OUT/share/doc 2>/dev/null || true
`,
  deps: [
    dep("source", ncduSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("ncurses", ncursesRecipe),
  ],
  runtime_deps: ["ncurses", "toolchain"],
});

await importToStore(recipe);
export const ncduRecipe = recipe;
