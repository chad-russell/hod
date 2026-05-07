//! procps-ng native build recipe — system process utilities.
//!
//! Builds procps-ng 4.0.6 with ncurses support for top, watch, slabtop.
//! Produces: ps, top, free, kill, pgrep, pkill, pidof, pidwait, pmap, pwdx,
//! slabtop, hugetop, sysctl, tload, uptime, vmstat, w, watch.
//! Also installs libproc2 shared library with headers and pkg-config.
//!
//! Links against shared libncursesw and glibc (both via runtime_deps).
//!
//! Dependencies:
//!   - ncurses (terminal handling for top/watch/slabtop) — shared lib
//!   - toolchain (gcc, glibc, pkgconf, coreutils, etc.)

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { ncursesRecipe } from "../ncurses/ncurses.js";
import { procpsNgSourceRecipe } from "./procps-ng-source.js";

const recipe = await shellBuild({
  toolchain: "toolchain",
  script: `

# Extract source
tar xf /deps/source/source -C /tmp
cd /tmp/procps-ng-4.0.6

export CPPFLAGS="-I/deps/ncurses/include -I/deps/ncurses/include/ncursesw"
export LDFLAGS="$HOD_DUMMY_RPATH -L/deps/ncurses/lib"
export NCURSES_CFLAGS="-I/deps/ncurses/include -I/deps/ncurses/include/ncursesw"
export NCURSES_LIBS="-L/deps/ncurses/lib -lncursesw"

./configure \\
  --prefix=/ \\
  --disable-nls \\
  --disable-dependency-tracking \\
  --without-systemd \\
  --without-elogind \\
  --with-ncurses

make -j$(nproc)
make install DESTDIR=$OUT

# Strip binaries
find $OUT/bin -type f -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true
find $OUT/sbin -type f -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true

# Remove docs, man, la files
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/lib/*.la 2>/dev/null || true
rmdir $OUT/share 2>/dev/null || true
`,
  deps: [
    dep("source", procpsNgSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("ncurses", ncursesRecipe),
  ],
  runtime_deps: ["ncurses", "toolchain"],
});

await importToStore(recipe);
export const procpsNgRecipe = recipe;
