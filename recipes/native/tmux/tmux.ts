//! tmux native build recipe — terminal multiplexer.
//!
//! Builds tmux 3.6a. Dependencies: libevent + ncurses (both built).
//! Standard autotools build. High everyday value for development workflow.
//!
//! Produces a single `bin/tmux` binary dynamically linked to libevent,
//! ncurses, and glibc via store-relative RPATH.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { tmuxSourceRecipe } from "./tmux-source.js";
import { libeventRecipe } from "../libevent/libevent.js";
import { ncursesRecipe } from "../ncurses/ncurses.js";
import { bisonRecipe } from "../bison/bison.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile({
    binDeps: ["bison"],
    includeDeps: ["libevent", "ncurses"],
    libDeps: ["libevent", "ncurses"],
    pkgConfigDeps: ["libevent", "ncurses"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

# pkg-config provides all -I/-L/-l flags from the relocatable .pc files.
export PATH="/deps/bison/bin:$PATH"
export YACC="bison -y"
export LDFLAGS="$HOD_DUMMY_RPATH"
export PKG_CONFIG_PATH="/deps/libevent/lib/pkgconfig:/deps/ncurses/lib/pkgconfig"

./configure \\
  --prefix=/ \\
  --disable-dependency-tracking \\
  --disable-static

make -j$(nproc)
make install DESTDIR=$OUT

# Strip the binary
/deps/toolchain/bin/strip $OUT/bin/tmux 2>/dev/null || true

# Clean up — remove docs, man, la files.
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/lib/*.la 2>/dev/null || true

# Verify key output
ls -la $OUT/bin/tmux
`,
  deps: [
    dep("source", tmuxSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("libevent", libeventRecipe),
    dep("ncurses", ncursesRecipe),
    dep("bison", bisonRecipe),
  ],
  runtime_deps: ["libevent", "ncurses", "toolchain"],
});

await importToStore(recipe);
export const tmuxRecipe = recipe;
