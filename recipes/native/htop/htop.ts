//! htop native build recipe — interactive process viewer.
//!
//! Builds htop 3.5.1 with ncursesw (unicode) support.
//! Produces the htop binary, which links against shared libncursesw and glibc
//! (both relocated via runtime_deps).
//!
//! Dependencies:
//!   - ncurses (terminal handling, unicode) — shared lib
//!   - toolchain (gcc, glibc, coreutils, etc.)

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { ncursesRecipe } from "../ncurses/ncurses.js";
import { htopSourceRecipe } from "./htop-source.js";

const recipe = await shellBuild({
  toolchain: "toolchain",
  script: `

# Extract source
tar xf /deps/source/source -C /tmp
cd /tmp/htop-3.5.1

# pkg-config provides -I/-L/-l flags from the relocatable ncurses .pc files.
export LDFLAGS="$HOD_DUMMY_RPATH"
export PKG_CONFIG_PATH="/deps/ncurses/lib/pkgconfig"

./configure \\
  --prefix=/ \\
  --enable-unicode \\
  --disable-dependency-tracking

make -j$(nproc)
make install DESTDIR=$OUT

# Strip binary
/deps/toolchain/bin/strip $OUT/bin/htop 2>/dev/null || true

# Remove docs and man pages
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/lib/*.la 2>/dev/null || true
rmdir $OUT/share 2>/dev/null || true
`,
  deps: [
    dep("source", htopSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("ncurses", ncursesRecipe),
  ],
  runtime_deps: ["ncurses", "toolchain"],
});

await importToStore(recipe);
export const htopRecipe = recipe;
