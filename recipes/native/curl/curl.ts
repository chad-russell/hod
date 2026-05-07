//! curl native build recipe — command-line tool and library for transferring data with URLs.
//!
//! Builds curl 8.20.0 with shared libcurl output (libcurl.so*). Dynamically
//! links glibc, shared openssl (libcrypto/libssl), and shared zlib from the
//! toolchain and dependency packages (all relocated via runtime_deps).
//!
//! Dependencies:
//!   - openssl (TLS/SSL) — shared, libs in lib/
//!   - zlib (compression) — shared, libs in lib/

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { opensslRecipe } from "../openssl/openssl.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { curlSourceRecipe } from "./curl-source.js";

const recipe = await shellBuild({
  toolchain: "toolchain",
  script: `

# Extract source
tar xf /deps/source/source -C /tmp
cd /tmp/curl-8.20.0

# Dynamically link shared openssl + zlib.
# Include dummy RPATH for store-relative relocation.
export CPPFLAGS="-I/deps/openssl/include -I/deps/zlib/include"
export LDFLAGS="$HOD_DUMMY_RPATH -L/deps/openssl/lib -L/deps/zlib/lib"
export LIBS="-lssl -lcrypto -ldl -lpthread -lz"

# pkg-config for feature detection (shared mode, no --static)
export PKG_CONFIG_PATH=/deps/openssl/lib/pkgconfig:/deps/zlib/lib/pkgconfig

# Allow configure's test programs to find shared deps
export LD_LIBRARY_PATH=/deps/openssl/lib:/deps/zlib/lib

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --disable-dependency-tracking \\
  --disable-docs \\
  --disable-manual \\
  --disable-ldap \\
  --disable-ldaps \\
  --with-openssl \\
  --with-zlib \\
  --without-ca-bundle \\
  --without-ca-path \\
  --without-libpsl \\
  --without-brotli \\
  --without-zstd \\
  --without-libidn2 \\
  --without-nghttp2 \\
  --without-ngtcp2 \\
  --without-nghttp3 \\
  --without-quiche \\
  --without-msh3 \\
  --without-libssh2 \\
  --without-gsasl \\
  --without-gssapi

make -j$(nproc)
make install DESTDIR=$OUT

# Strip binary and shared library
/deps/toolchain/bin/strip $OUT/bin/curl 2>/dev/null || true
find $OUT/lib -name 'lib*.so.*' -type f -exec /deps/toolchain/bin/strip --strip-unneeded {} + 2>/dev/null || true

# Clean up - remove docs and unneeded files, keep lib/pkgconfig for downstream
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/aclocal $OUT/lib/*.la 2>/dev/null || true
rmdir $OUT/share 2>/dev/null || true`,
  deps: [
    dep("source", curlSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("openssl", opensslRecipe),
    dep("zlib", zlibRecipe),
  ],
  runtime_deps: ["openssl", "toolchain", "zlib"],
});

await importToStore(recipe);
export const curlRecipe = recipe;
