//! ncurses native build recipe — terminal handling library with shared outputs.
//!
//! Builds ncurses 6.6 with wide-character support and shared library outputs.
//! Provides libncursesw, libtinfow, libpanelw, libmenuw, libformw shared libs
//! plus non-widec compatibility symlinks. Downstream packages (less, readline,
//! cbonsai, bash, vim, etc.) link against these.
//!
//! No dependencies beyond the toolchain. Dynamically links glibc from the
//! toolchain (relocated via runtime_deps).

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { ncursesSourceRecipe } from "./ncurses-source.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_LIBRARIES, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile(),
  sourceDir: true,
  script: `
./configure \\
  --srcdir=. \\
  --prefix=/ \\
  --with-shared \\
  --without-normal \\
  --enable-widec \\
  --without-debug \\
  --without-ada \\
  --without-manpages \\
  --without-tests \\
  --without-cxx-binding \\
  --disable-stripping \
  --enable-pc-files \
  --with-pkg-config=/deps/toolchain/bin/pkg-config \
  --with-pkg-config-libdir=/lib/pkgconfig

make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

# Add parent include path so <ncursesw/...> cross-includes resolve.
for pc in $OUT/lib/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  sed -i '/^Cflags:/ s|$| -I\${prefix}/include|' "$pc"
done

# Some downstream configure scripts check for <ncurses.h>. Wide ncurses
# installs curses.h as the canonical header, so provide the conventional alias
# in the ncursesw include directory.
[ -e $OUT/include/ncursesw/ncurses.h ] || cp $OUT/include/ncursesw/curses.h $OUT/include/ncursesw/ncurses.h

${STRIP_LIBRARIES}

# Create non-widec compatibility symlinks
cd $OUT/lib
for f in lib*w.so lib*w.so.* lib*w.so.*.* lib*w.so.*.*.*; do
  [ -e "$f" ] || continue
  ln -sf "$f" "$(echo "$f" | sed 's/w//')"
done
if [ -d $OUT/lib/pkgconfig ]; then
  cd $OUT/lib/pkgconfig
  for f in *.pc; do
    ln -sf "$f" "$(echo "$f" | sed 's/w//')"
  done
fi

# Clean up — keep lib/pkgconfig for downstream deps
rm -rf $OUT/share/doc $OUT/share/man $OUT/lib/*.la 2>/dev/null || true
rmdir $OUT/share 2>/dev/null || true`,
  deps: [
    dep("source", ncursesSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const ncursesRecipe = recipe;
