//! wget native build recipe — GNU Wget, the classic non-interactive network downloader.
//!
//! Builds wget 1.25.0 with openssl for HTTPS support and zlib for compression.
//! Dynamically links glibc, shared openssl (libcrypto/libssl), and shared zlib
//! from the toolchain and dependency packages (all relocated via runtime_deps).
//!
//! Dependencies:
//!   - openssl (TLS/SSL) — shared, libs in lib/
//!   - zlib (compression) — shared, libs in lib/

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { opensslRecipe } from "../openssl/openssl.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { wgetSourceRecipe } from "./wget-source.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_BINARIES } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["openssl", "zlib"],
    libDeps: ["openssl", "zlib"],
    pkgConfigDeps: ["openssl", "zlib"],
  }),
  sourceDir: true,
  script: `

# pkg-config provides all -I/-L/-l flags from the relocatable .pc files.
export LDFLAGS="$HOD_DUMMY_RPATH"

# Allow configure's test programs to find shared deps
export LD_LIBRARY_PATH=/deps/openssl/lib:/deps/zlib/lib

./configure \
  --prefix=/ \
  --disable-dependency-tracking \
  --disable-nls \
  --disable-iri \
  --with-ssl=openssl \
  --with-zlib \
  --without-libpsl \
  --without-metalink \
  --without-pcre2

make -j$(nproc)
make install DESTDIR=$OUT

${STRIP_BINARIES}
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/lib/*.la 2>/dev/null || true
rmdir $OUT/share 2>/dev/null || true
`,
  deps: [
    dep("source", wgetSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("openssl", opensslRecipe),
    dep("zlib", zlibRecipe),
  ],
  runtime_deps: ["openssl", "toolchain", "zlib"],
});

await importToStore(recipe);
export const wgetRecipe = recipe;
