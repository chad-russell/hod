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
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

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
export PKG_CONFIG_PATH=/deps/openssl/lib/pkgconfig:/deps/zlib/lib/pkgconfig

# Allow configure's test programs to find shared deps
export LD_LIBRARY_PATH=/deps/openssl/lib:/deps/zlib/lib

# === Diagnostic: test gcc -E ===
echo "int x;" > /tmp/test_cpp.c
$CPP /tmp/test_cpp.c 2>&1 || echo "CPP FAILED with exit code $?"
echo "=== gcc -v ==="
/deps/toolchain/bin/gcc -v 2>&1 | tail -5
echo "=== trying to run cc1 directly ==="
/deps/toolchain/lib/gcc/x86_64-linux-gnu/13.2.0/cc1 --version 2>&1 || echo "cc1 FAILED with exit code $?"
echo "=== ldd cc1 ==="
LD_LIBRARY_PATH=/deps/toolchain/lib /deps/toolchain/lib/ld-linux-x86-64.so.2 --list /deps/toolchain/libexec/gcc/x86_64-linux-gnu/13.2.0/cc1 2>&1 || echo "ldd FAILED"
echo "=== End diagnostic ==="

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
  --with-ca-bundle=/etc/ssl/certs/ca-bundle.crt \\
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

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
rm -rf $OUT/share/aclocal 2>/dev/null || true
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
