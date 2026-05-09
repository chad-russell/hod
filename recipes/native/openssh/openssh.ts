//! openssh native build recipe — SSH client and server suite.
//!
//! Builds OpenSSH 10.3p1. Dynamically links shared openssl (libcrypto/libssl)
//! and shared zlib, plus glibc via runtime_deps.
//!
//! Produces: ssh, scp, sftp, sshd, ssh-agent, ssh-add, ssh-keygen, ssh-keyscan.
//!
//! Dependencies:
//!   - openssl (TLS/crypto) — shared, libs in lib/
//!   - zlib (compression) — shared, libs in lib/

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { opensslRecipe } from "../openssl/openssl.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { opensshSourceRecipe } from "./openssh-source.js";

const recipe = await shellBuild({
  toolchain: "toolchain",
  script: `

# Extract source
tar xf /deps/source/source -C /tmp
cd /tmp/openssh-10.3p1

# pkg-config provides -I/-L/-l flags from the relocatable .pc files.
export LDFLAGS="$HOD_DUMMY_RPATH"
export PKG_CONFIG_PATH="/deps/openssl/lib/pkgconfig:/deps/zlib/lib/pkgconfig"

# Allow configure's test programs to find shared libs
export LD_LIBRARY_PATH=/deps/openssl/lib:/deps/zlib/lib

./configure \\
  --prefix=/ \\
  --sysconfdir=/etc/ssh \\
  --with-ssl-dir=/deps/openssl \\
  --with-zlib=/deps/zlib \\
  --without-pam \\
  --without-kerberos5 \\
  --without-libedit \\
  --without-ldns \\
  --without-selinux \\
  --without-shadow \\
  --without-xauth \\
  --without-security-key-builtin \\
  --without-security-key-standalone \\
  --disable-strip \\
  --with-privsep-path=/var/empty \\
  --with-privsep-user=sshd \\
  --with-pid-dir=/run

make -j$(nproc)
make install DESTDIR=$OUT

# Strip all binaries
find $OUT/bin $OUT/sbin -type f -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true
find $OUT/libexec -type f -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true

# Clean up — remove docs, man pages, but keep config in etc/ssh
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info 2>/dev/null || true
rmdir $OUT/share 2>/dev/null || true
`,
  deps: [
    dep("source", opensshSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("openssl", opensslRecipe),
    dep("zlib", zlibRecipe),
  ],
  runtime_deps: ["openssl", "toolchain", "zlib"],
});

await importToStore(recipe);
export const opensshRecipe = recipe;
