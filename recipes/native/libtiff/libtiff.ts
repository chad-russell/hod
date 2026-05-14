//! libtiff build recipe — TIFF image format library.
//!
//! Builds libtiff 4.7.0. Dependencies: zlib, libjpeg, xz, zstd.
//! Required by gdk-pixbuf (TIFF loader) and GTK4.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libtiffSourceRecipe } from "./libtiff-source.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { libjpegRecipe } from "../libjpeg/libjpeg.js";
import { xzRecipe } from "../xz/xz.js";
import { zstdRecipe } from "../zstd/zstd.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL } from "../../helpers/strip.js";

export const libtiffRuntimeDeps = ["libjpeg", "toolchain", "xz", "zlib", "zstd"];

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["zlib", "libjpeg", "xz", "zstd"],
    libDeps: ["zlib", "libjpeg", "xz", "zstd"],
    pkgConfigDeps: ["zlib", "libjpeg", "xz", "zstd"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

export CXX="/deps/toolchain/bin/g++ --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --disable-dependency-tracking \\
  --with-zlib-include-dir=/deps/zlib/include \\
  --with-zlib-lib-dir=/deps/zlib/lib \\
  --with-jpeg-include-dir=/deps/libjpeg/include \\
  --with-jpeg-lib-dir=/deps/libjpeg/lib \\
  --with-lzma-include-dir=/deps/xz/include \\
  --with-lzma-lib-dir=/deps/xz/lib \\
  --with-zstd-include-dir=/deps/zstd/include \\
  --with-zstd-lib-dir=/deps/zstd/lib \\
  --disable-docs \\
  --disable-tests \\
  --disable-contrib

make -j$(nproc)
make install DESTDIR=$OUT

# Make pkg-config files relocatable.
for pc in $OUT/lib/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*)   sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
  esac
done

${STRIP_ALL}
`,
  deps: [
    dep("source", libtiffSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("zlib", zlibRecipe),
    dep("libjpeg", libjpegRecipe),
    dep("xz", xzRecipe),
    dep("zstd", zstdRecipe),
  ],
  runtime_deps: libtiffRuntimeDeps,
});

await importToStore(recipe);
export const libtiffRecipe = recipe;
