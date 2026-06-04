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
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const libtiffRuntimeDeps = ["libjpeg", "toolchain", "xz", "zlib", "zstd"];

const recipe = await shellBuild({
  ...cProfile({
    cxx: true,
    includeDeps: ["zlib", "libjpeg", "xz", "zstd"],
    libDeps: ["zlib", "libjpeg", "xz", "zstd"],
    pkgConfigDeps: ["zlib", "libjpeg", "xz", "zstd"],
  }),
  sourceDir: true,
  script: `
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

${RELOCATE_PKG_CONFIG}

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
