//! libarchive build recipe — multi-format archive and compression library.
//!
//! Builds libarchive 3.7.7 with support for gzip (zlib), bzip2, xz, and openssl.
//! Dependencies: zlib, bzip2, xz, openssl, libxml2, toolchain.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libarchiveSourceRecipe } from "./libarchive-source.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { bzip2Recipe } from "../bzip2/bzip2.js";
import { xzRecipe } from "../xz/xz.js";
import { opensslRecipe } from "../openssl/openssl.js";
import { libxml2Recipe } from "../libxml2/libxml2.js";
import { libiconvRecipe } from "../libiconv/libiconv.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const libarchiveRuntimeDeps = ["bzip2", "libiconv", "libxml2", "openssl", "toolchain", "xz", "zlib"];

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["zlib", "bzip2", "xz", "openssl", "libxml2", "libiconv"],
    includePaths: ["/deps/libxml2/include/libxml2"],
    libDeps: ["zlib", "bzip2", "xz", "openssl", "libxml2", "libiconv"],
    pkgConfigDeps: ["zlib", "bzip2", "xz", "openssl", "libxml2", "libiconv"],
  }),
  sourceDir: true,
  script: `
# Allow configure's test programs to find shared deps at runtime
export LD_LIBRARY_PATH="/deps/zlib/lib:/deps/bzip2/lib:/deps/xz/lib:/deps/openssl/lib:/deps/libxml2/lib:/deps/libiconv/lib"

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --with-zlib \\
  --with-bz2lib \\
  --with-lzma \\
  --with-openssl \\
  --with-xml2 \\
  --without-iconv \\
  --disable-acl \\
  --disable-xattr \\
  --without-cng \\
  --without-lz4 \\
  --without-zstd \\
  --without-nettle \\
  --without-expat

make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", libarchiveSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("zlib", zlibRecipe),
    dep("bzip2", bzip2Recipe),
    dep("xz", xzRecipe),
    dep("openssl", opensslRecipe),
    dep("libxml2", libxml2Recipe),
    dep("libiconv", libiconvRecipe),
  ],
  runtime_deps: libarchiveRuntimeDeps,
});

await importToStore(recipe);
export const libarchiveRecipe = recipe;
