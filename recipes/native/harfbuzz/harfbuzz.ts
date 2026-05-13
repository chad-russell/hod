//! harfbuzz build recipe — text shaping library.
//!
//! Builds HarfBuzz 10.2.0 with FreeType support, without GLib/ICU/Cairo.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { harfbuzzSourceRecipe } from "./harfbuzz-source.js";
import { freetypeRecipe } from "../freetype/freetype.js";
import { bzip2Recipe } from "../bzip2/bzip2.js";
import { libpngRecipe } from "../libpng/libpng.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL } from "../../helpers/strip.js";

export const harfbuzzRuntimeDeps = ["bzip2", "freetype", "libpng", "toolchain", "zlib"];

const recipe = await shellBuild({
  ...mesonProfile({
    includeDeps: ["freetype", "bzip2", "libpng", "zlib"],
    includePaths: ["/deps/freetype/include/freetype2"],
    libDeps: ["freetype", "bzip2", "libpng", "zlib"],
    pkgConfigDeps: ["freetype", "bzip2", "libpng", "zlib"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

find . -name '*.py' -type f -exec sed -i '1s|^#!/usr/bin/env python3|#!/deps/python/bin/python3|' {} +

export CXX="/deps/toolchain/bin/g++ --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"
export CXXFLAGS="-O2 -I/deps/freetype/include/freetype2"
export CPPFLAGS="-I/deps/freetype/include/freetype2"

meson setup build \
  --prefix=/ \
  --libdir=lib \
  --buildtype=release \
  -Ddefault_library=shared \
  -Dglib=disabled \
  -Dgobject=disabled \
  -Dcairo=disabled \
  -Dchafa=disabled \
  -Dicu=disabled \
  -Dgraphite=disabled \
  -Dgraphite2=disabled \
  -Dfreetype=enabled \
  -Dtests=disabled \
  -Dintrospection=disabled \
  -Ddocs=disabled \
  -Dutilities=disabled

ninja -C build
DESTDIR=$OUT ninja -C build install

# Make pkg-config files relocatable.
for pc in $OUT/lib/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
  esac
done

find $OUT/bin -type f -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true
${STRIP_ALL}
`,
  deps: [
    dep("source", harfbuzzSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("freetype", freetypeRecipe),
    dep("bzip2", bzip2Recipe),
    dep("libpng", libpngRecipe),
    dep("zlib", zlibRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: harfbuzzRuntimeDeps,
});

await importToStore(recipe);
export const harfbuzzRecipe = recipe;
