//! nnn native build recipe — the unorthodox terminal file manager.
//!
//! Builds nnn 5.2 with readline support. nnn uses a Makefile-based build system
//! that uses pkg-config to discover ncursesw and links libreadline for its
//! interactive prompt. The ncurses/readline .pc files use pcfiledir to resolve
//! to correct sandbox paths, so PKG_CONFIG_PATH is sufficient.
//!
//! Dependencies:
//!   - ncurses (terminal handling) — shared libncursesw
//!   - readline (prompt editing) — shared libreadline
//!   - toolchain (C compiler + glibc)

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { ncursesRecipe } from "../ncurses/ncurses.js";
import { readlineRecipe } from "../readline/readline.js";
import { nnnSourceRecipe } from "./nnn-source.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["ncurses", "readline"],
    libDeps: ["ncurses", "readline"],
    pkgConfigDeps: ["ncurses", "readline"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

# pkg-config provides ncurses -I/-L/-l flags from the relocatable .pc files.
# readline is linked directly (not via pkg-config), so we need explicit paths.
export CPPFLAGS="-I/deps/readline/include"
export LDFLAGS="$HOD_DUMMY_RPATH -L/deps/readline/lib"
export PKG_CONFIG_PATH="/deps/ncurses/lib/pkgconfig:/deps/readline/lib/pkgconfig"

# nnn's Makefile uses pkg-config to find ncursesw and links libreadline.
# CFLAGS/CPPFLAGS/LDLIBS are set by the Makefile from pkg-config output.
make -j$(nproc) \\
  CC="$CC" \\
  STRIP="/deps/toolchain/bin/strip" \\
  CFLAGS_OPTIMIZATION="-O2"

make install DESTDIR=$OUT PREFIX=/

# Strip binary
/deps/toolchain/bin/strip $OUT/bin/nnn 2>/dev/null || true

# Remove man pages
rm -rf $OUT/share/man 2>/dev/null || true
rmdir $OUT/share 2>/dev/null || true
`,
  deps: [
    dep("source", nnnSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("ncurses", ncursesRecipe),
    dep("readline", readlineRecipe),
  ],
  runtime_deps: ["ncurses", "readline", "toolchain"],
});

await importToStore(recipe);
export const nnnRecipe = recipe;
