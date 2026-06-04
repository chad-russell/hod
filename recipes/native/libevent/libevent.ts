//! libevent native build recipe — event notification library.
//!
//! Builds libevent 2.1.12-stable. Dependencies: openssl (optional, for
//! bufferevent OpenSSL support — already built).
//!
//! Produces libevent.so, libevent_openssl.so, libevent_pthreads.so.
//! Enables tmux, tor, memcached, and many network services.
//!
//! Dynamically links glibc and openssl (relocated via runtime_deps).

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libeventSourceRecipe } from "./libevent-source.js";
import { opensslRecipe } from "../openssl/openssl.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["openssl"],
    libDeps: ["openssl"],
    pkgConfigDeps: ["openssl"],
  }),
  sourceDir: true,
  script: `
# Make openssl discoverable
export CPPFLAGS="-I/deps/openssl/include"
export LDFLAGS="$HOD_DUMMY_RPATH -L/deps/openssl/lib"
export PKG_CONFIG_PATH="/deps/openssl/lib/pkgconfig"

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --disable-dependency-tracking \\
  --disable-samples

make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
rm -rf $OUT/share/info 2>/dev/null || true

# Verify key outputs
ls -la $OUT/lib/libevent.so
ls -la $OUT/lib/libevent_openssl.so
ls -la $OUT/lib/pkgconfig/libevent.pc
`,
  deps: [
    dep("source", libeventSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("openssl", opensslRecipe),
  ],
  runtime_deps: ["openssl", "toolchain"],
});

await importToStore(recipe);
export const libeventRecipe = recipe;
