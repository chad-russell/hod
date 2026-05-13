//! libpng build recipe — PNG image library.
//!
//! Builds libpng 1.6.47 shared-first against zlib.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libpngSourceRecipe } from "./libpng-source.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL } from "../../helpers/strip.js";

export const libpngRuntimeDeps = ["toolchain", "zlib"];

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["zlib"],
    libDeps: ["zlib"],
    pkgConfigDeps: ["zlib"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

./configure \
  --prefix=/ \
  --enable-shared \
  --enable-static \
  --disable-dependency-tracking \
  --disable-tools \
  --disable-tests

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

${STRIP_ALL}
`,
  deps: [
    dep("source", libpngSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("zlib", zlibRecipe),
  ],
  runtime_deps: libpngRuntimeDeps,
});

await importToStore(recipe);
export const libpngRecipe = recipe;
