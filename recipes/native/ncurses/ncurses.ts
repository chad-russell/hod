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

const recipe = await shellBuild({
  toolchain: "toolchain",
  script: `

tar xf /deps/source/source -C /tmp
cd /tmp/ncurses-6.6

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
  --disable-stripping

make -j$(nproc)
make install DESTDIR=$OUT

# Strip shared libraries
for f in $OUT/lib/lib*.so.*.*.*; do
  /deps/toolchain/bin/strip "$f" 2>/dev/null || true
done

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
