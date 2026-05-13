//! fontconfig build recipe — font discovery and configuration library.
//!
//! Builds fontconfig 2.16.0 against FreeType and Expat.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { fontconfigSourceRecipe } from "./fontconfig-source.js";
import { freetypeRecipe } from "../freetype/freetype.js";
import { expatRecipe } from "../expat/expat.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { libpngRecipe } from "../libpng/libpng.js";
import { bzip2Recipe } from "../bzip2/bzip2.js";
import { pythonRecipe } from "../python/python.js";
import { gperfRecipe } from "../gperf/gperf.js";
import { cProfile } from "../../helpers/c.js";

export const fontconfigRuntimeDeps = ["bzip2", "expat", "freetype", "libpng", "toolchain", "zlib"];

const recipe = await shellBuild({
  ...cProfile({
    binDeps: ["python", "gperf"],
    includeDeps: ["freetype", "expat", "zlib", "libpng", "bzip2"],
    includePaths: ["/deps/freetype/include/freetype2"],
    libDeps: ["freetype", "expat", "zlib", "libpng", "bzip2"],
    pkgConfigDeps: ["freetype", "expat", "zlib", "libpng", "bzip2"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

./configure \
  --prefix=/ \
  --sysconfdir=/etc \
  --localstatedir=/var \
  --enable-shared \
  --disable-static \
  --disable-dependency-tracking \
  --disable-docbook \
  --disable-docs \
  --disable-nls \
  --disable-cache-build \
  --with-expat=/deps/expat \
  --with-default-fonts=/share/fonts \
  --with-add-fonts=/local/share/fonts

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
rm -rf $OUT/share/doc $OUT/share/man $OUT/lib/*.la 2>/dev/null || true
`,
  deps: [
    dep("source", fontconfigSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("freetype", freetypeRecipe),
    dep("expat", expatRecipe),
    dep("zlib", zlibRecipe),
    dep("libpng", libpngRecipe),
    dep("bzip2", bzip2Recipe),
    dep("python", pythonRecipe),
    dep("gperf", gperfRecipe),
  ],
  runtime_deps: fontconfigRuntimeDeps,
});

await importToStore(recipe);
export const fontconfigRecipe = recipe;
