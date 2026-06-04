//! libxml2 native build recipe — XML C parser and toolkit.
//!
//! Builds libxml2 2.13.8. Dependencies: zlib, xz (liblzma), libiconv (all built).
//! Produces libxml2.so, headers, and pkg-config.
//!
//! Ubiquitous dependency — used by curl, desktop stack, Python lxml, etc.
//! Dynamically links glibc and all deps (relocated via runtime_deps).

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libxml2SourceRecipe } from "./libxml2-source.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { xzRecipe } from "../xz/xz.js";
import { libiconvRecipe } from "../libiconv/libiconv.js";
import { cProfile } from "../../helpers/c.js";
import { RELOCATE_PKG_CONFIG, STRIP_BINARIES } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["zlib", "xz", "libiconv"],
    libDeps: ["zlib", "xz", "libiconv"],
    pkgConfigDeps: ["zlib", "xz"],
  }),
  sourceDir: true,
  script: `
# Make dependency headers and libs discoverable
export CPPFLAGS="-I/deps/zlib/include -I/deps/xz/include -I/deps/libiconv/include"
export LDFLAGS="$HOD_DUMMY_RPATH -L/deps/zlib/lib -L/deps/xz/lib -L/deps/libiconv/lib -Wl,-rpath-link,/deps/zlib/lib -Wl,-rpath-link,/deps/xz/lib -Wl,-rpath-link,/deps/libiconv/lib"
export PKG_CONFIG_PATH="/deps/zlib/lib/pkgconfig:/deps/xz/lib/pkgconfig"

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --disable-dependency-tracking \\
  --without-python \\
  --without-lzma \\
  --with-zlib \\
  --with-iconv \\
  --without-readline \\
  --without-icu

make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

${STRIP_BINARIES}

# Fix xmllint and xmlcatalog to find their catalog at the dep mount point
# --prefix=/ produces references to //etc and //share
sed -i 's|//etc/xml|/deps/libxml2/etc/xml|g' $OUT/bin/xmllint $OUT/bin/xmlcatalog 2>/dev/null || true
sed -i 's|//share/xml|/deps/libxml2/share/xml|g' $OUT/bin/xmllint $OUT/bin/xmlcatalog 2>/dev/null || true

# Clean up — remove docs, man, la files. Keep pkgconfig and aclocal.
rm -rf $OUT/share/doc $OUT/share/gtk-doc $OUT/share/man $OUT/share/info $OUT/lib/*.la 2>/dev/null || true

# Verify key outputs
ls -la $OUT/bin/xmllint
ls -la $OUT/lib/libxml2.so
ls -la $OUT/lib/pkgconfig/libxml-2.0.pc
`,
  deps: [
    dep("source", libxml2SourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("zlib", zlibRecipe),
    dep("xz", xzRecipe),
    dep("libiconv", libiconvRecipe),
  ],
  runtime_deps: ["libiconv", "toolchain", "xz", "zlib"],
});

await importToStore(recipe);
export const libxml2Recipe = recipe;
