//! less native build recipe — the standard Unix file pager.
//!
//! Builds less 692 with ncurses support. Links against shared libncursesw
//! and glibc from the toolchain (both relocated via runtime_deps).
//!
//! Dependencies:
//!   - ncurses (terminal handling) — shared lib

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { ncursesRecipe } from "../ncurses/ncurses.js";
import { lessSourceRecipe } from "./less-source.js";

const recipe = await shellBuild({
  toolchain: "toolchain",
  script: `

# Extract source
tar xf /deps/source/source -C /tmp
cd /tmp/less-692

# pkg-config provides -I/-L/-l flags from the relocatable ncurses .pc files.
export LDFLAGS="$HOD_DUMMY_RPATH"
export PKG_CONFIG_PATH="/deps/ncurses/lib/pkgconfig"

# less uses a custom configure (not autotools)
./configure \\
  --prefix=/ \\
  --with-ncursesw

make -j$(nproc)
make install DESTDIR=$OUT

# Strip the binary
/deps/toolchain/bin/strip $OUT/bin/less $OUT/bin/lessecho $OUT/bin/lesskey 2>/dev/null || true

# Remove docs
rm -rf $OUT/share/man 2>/dev/null || true
`,
  deps: [
    dep("source", lessSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("ncurses", ncursesRecipe),
  ],
  runtime_deps: ["ncurses", "toolchain"],
});

await importToStore(recipe);
export const lessRecipe = recipe;
