//! freetype build recipe — font rendering library.
//!
//! Builds FreeType 2.13.3 with zlib, libpng, and bzip2 support.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { freetypeSourceRecipe } from "./freetype-source.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { libpngRecipe } from "../libpng/libpng.js";
import { bzip2Recipe } from "../bzip2/bzip2.js";
import { cProfile } from "../../helpers/c.js";

export const freetypeRuntimeDeps = ["bzip2", "libpng", "toolchain", "zlib"];

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["zlib", "libpng", "bzip2"],
    libDeps: ["zlib", "libpng", "bzip2"],
    pkgConfigDeps: ["zlib", "libpng", "bzip2"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

./configure \
  --prefix=/ \
  --enable-shared \
  --disable-static \
  --with-zlib=yes \
  --with-bzip2=yes \
  --with-png=yes \
  --with-harfbuzz=no \
  --with-brotli=no

make -j$(nproc)
make install DESTDIR=$OUT

# Make pkg-config files relocatable.
for pc in $OUT/lib/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
  esac
done

find $OUT/bin -type f -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true
find $OUT/lib -name '*.so*' -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/aclocal $OUT/lib/*.la 2>/dev/null || true
`,
  deps: [
    dep("source", freetypeSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("zlib", zlibRecipe),
    dep("libpng", libpngRecipe),
    dep("bzip2", bzip2Recipe),
  ],
  runtime_deps: freetypeRuntimeDeps,
});

await importToStore(recipe);
export const freetypeRecipe = recipe;
