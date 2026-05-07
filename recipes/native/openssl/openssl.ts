//! openssl native build recipe — TLS/SSL and cryptography library.
//!
//! OpenSSL 3.5 LTS built with shared + static library outputs (libcrypto.so,
//! libssl.so). Shared libraries use store-relative RUNPATH via runtime_deps.
//! Downstream packages link against the shared libs via pkg-config.
//!
//! Dependencies:
//!   - zlib (compression) — shared, for libcrypto compression support
//!   - perl — needed by OpenSSL's Configure script
import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { perlRecipe } from "../perl/perl.js";
import { opensslSourceRecipe } from "./openssl-source.js";

const recipe = await shellBuild({
  toolchain: "toolchain",
  script: `

# Extract source
tar xf /deps/source/source -C /tmp
cd /tmp/openssl-3.5.0

export PATH=/deps/toolchain/bin:/deps/perl/bin
export PERL5LIB=/deps/perl/lib/perl5/5.40.0:/deps/perl/lib/perl5/5.40.0/x86_64-linux

# Build shared + static libraries.
# --libdir=lib ensures consistent lib/ (not lib64/) for store-relative relocation.
# $HOD_DUMMY_RPATH reserves ELF space for store-relative RUNPATH patching.
# no-module → providers are statically compiled into libcrypto (simpler runtime).
# no-legacy → skip deprecated algorithms.
CC="/deps/toolchain/bin/gcc --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin" \\
AR=/deps/toolchain/bin/ar \\
RANLIB=/deps/toolchain/bin/ranlib \\
CFLAGS="-O2" \\
LDFLAGS="$HOD_DUMMY_RPATH" \\
perl ./Configure \\
  linux-x86_64 \\
  --prefix=/ \\
  --libdir=lib \\
  --openssldir=/etc/ssl \\
  no-module \\
  no-tests \\
  no-docs \\
  no-legacy \\
  -I/deps/zlib/include \\
  -L/deps/zlib/lib \\
  -lz

make -j$(nproc)
make install DESTDIR=$OUT

# Strip shared libraries (all .so.N files, not symlinks)
find $OUT/lib -name 'lib*.so.*' -type f -exec /deps/toolchain/bin/strip --strip-unneeded {} + 2>/dev/null || true
# Strip the openssl binary
/deps/toolchain/bin/strip $OUT/bin/openssl 2>/dev/null || true

# Remove unnecessary files, keep pkgconfig and headers for downstream deps
rm -rf $OUT/etc/ssl/private 2>/dev/null || true
rm -rf $OUT/share/doc $OUT/share/man 2>/dev/null || true
# Remove empty dirs from no-module build
rmdir $OUT/lib/engines-3 $OUT/lib/ossl-modules 2>/dev/null || true
find $OUT -name '*.la' -delete 2>/dev/null || true`,
  deps: [
    dep("source", opensslSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("zlib", zlibRecipe),
    dep("perl", perlRecipe),
  ],
  runtime_deps: ["toolchain", "zlib"],
});

await importToStore(recipe);
export const opensslRecipe = recipe;
