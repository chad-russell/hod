//! ncurses native build recipe — built with the native toolchain.
import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { ncursesSourceRecipe } from "./ncurses-source.js";

const recipe = await shellBuild({
  toolchain: "toolchain",
  script: `

tar xf /deps/source/source -C /tmp
cd /tmp/ncurses-6.6

export PATH=/deps/toolchain/bin
export CC="/deps/toolchain/bin/gcc --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"
export AR=/deps/toolchain/bin/ar
export RANLIB=/deps/toolchain/bin/ranlib
export STRIP=/deps/toolchain/bin/strip
export CFLAGS="-O2"
export LDFLAGS="-static"

./configure \\
  --srcdir=. \\
  --prefix=/ \\
  --disable-shared \\
  --enable-static \\
  --enable-widec \\
  --without-debug \\
  --without-ada \\
  --without-manpages \\
  --without-tests \\
  --without-cxx-binding \\
  --disable-stripping

make -j$(nproc)
make install DESTDIR=$OUT

# Create non-widec compatibility symlinks so cbonsai's Makefile can find -lncurses
cd $OUT/lib
# Create non-widec compatibility symlinks (e.g., libncurses.a → libncursesw.a)
# The glob covers libncursesw*, libtinfow*, libpanelw*, libmenuw*, libformw*
for f in lib*w.a lib*w.so; do
  [ -e "$f" ] || continue
  ln -sf "$f" "$(echo "$f" | sed 's/w//')"
done
if [ -d $OUT/lib/pkgconfig ]; then
  cd $OUT/lib/pkgconfig
  for f in *.pc; do
    ln -sf "$f" "$(echo "$f" | sed 's/w//')"
  done
fi`,
  deps: [
    dep("source", ncursesSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
});

await importToStore(recipe);
export const ncursesRecipe = recipe;
