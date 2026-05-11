//! git native build recipe — fast distributed version control system.
//!
//! Builds git 2.54.0 with HTTP/HTTPS support via shared curl and openssl.
//! Dynamically links glibc, shared openssl (libcrypto/libssl), shared curl
//! (libcurl), shared zlib, shared expat, and shared libiconv from the store
//! (all relocated via runtime_deps).
//!
//! Git uses a Makefile-based build system (not autotools). We write a
//! config.mak file to set CC, dependency paths, and build flags. This is
//! the recommended approach — it overrides git's defaults like CC=cc.
//!
//! Dependencies:
//!   - curl (HTTP/HTTPS transport) — shared, libs in lib/
//!   - expat (XML parser for HTTP push) — shared, libs in lib/
//!   - libiconv (character encoding) — shared, libs in lib/
//!   - openssl (TLS + SHA crypto) — shared, libs in lib/
//!   - zlib (compression) — shared, libs in lib/
//!   - toolchain (glibc, gcc, binutils, make, etc.)

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { curlRecipe } from "../curl/curl.js";
import { opensslRecipe } from "../openssl/openssl.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { expatRecipe } from "../expat/expat.js";
import { libiconvRecipe } from "../libiconv/libiconv.js";
import { gitSourceRecipe } from "./git-source.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["curl", "expat", "libiconv", "openssl", "zlib"],
    libDeps: ["curl", "expat", "libiconv", "openssl", "zlib"],
    pkgConfigDeps: ["curl", "expat", "openssl", "zlib"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

# Allow shared lib resolution during build for test programs / generated code
export LD_LIBRARY_PATH=/deps/curl/lib:/deps/openssl/lib:/deps/zlib/lib:/deps/expat/lib:/deps/libiconv/lib

# Write config.mak — this overrides git's Makefile defaults (CC=cc, etc.)
# and is the recommended way to configure git's Makefile-based build.
cat > config.mak <<'EOF'
CC = /deps/toolchain/bin/gcc --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin
AR = /deps/toolchain/bin/ar
RANLIB = /deps/toolchain/bin/ranlib
STRIP = /deps/toolchain/bin/strip
CFLAGS = -O2
LDFLAGS = __HOD_DUMMY_RPATH__ -L/deps/curl/lib -L/deps/openssl/lib -L/deps/zlib/lib -L/deps/expat/lib -L/deps/libiconv/lib
NEEDS_LIBICONV = YesPlease
ICONVDIR = /deps/libiconv
CURLDIR = /deps/curl
OPENSSLDIR = /deps/openssl
EXPATDIR = /deps/expat
ZLIB_PATH = /deps/zlib
NO_GETTEXT = YesPlease
NO_TCLTK = YesPlease
NO_PYTHON = YesPlease
INSTALL_SYMLINKS = YesPlease
CURL_LDFLAGS = -lcurl
NO_INSTALL_HARDLINKS = YesPlease
EOF

# Replace the placeholder with the actual dummy RPATH (config.mak is single-quoted so
# $HOD_DUMMY_RPATH wasn't expanded — do it here).
sed -i "s|__HOD_DUMMY_RPATH__|$HOD_DUMMY_RPATH|" config.mak

make -j$(nproc) prefix=/
make install DESTDIR=$OUT prefix=/

# Strip binaries
find $OUT/bin -type f -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true
find $OUT/libexec -type f -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true

# Clean up — remove docs and unneeded files
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/share/perl 2>/dev/null || true
rm -rf $OUT/share/git-gui $OUT/share/gitweb 2>/dev/null || true
# Keep share/git-core for completion scripts, etc.
# Keep share/git-core/templates — git init needs it
`,
  deps: [
    dep("source", gitSourceRecipe),
    dep("curl", curlRecipe),
    dep("expat", expatRecipe),
    dep("libiconv", libiconvRecipe),
    dep("openssl", opensslRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("zlib", zlibRecipe),
  ],
  runtime_deps: ["curl", "expat", "libiconv", "openssl", "toolchain", "zlib"],
});

await importToStore(recipe);
export const gitRecipe = recipe;
