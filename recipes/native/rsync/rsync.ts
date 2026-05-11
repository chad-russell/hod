//! rsync native build recipe — fast incremental file transfer utility.
//!
//! Builds rsync 3.3.0. Links against shared openssl (for checksum crypto),
//! shared zlib (for compression), and shared zstd. Dynamically links glibc
//! from the toolchain (relocated via runtime_deps).
//!
//! rsync's configure.sh can't run compiled test programs to determine type
//! sizes in the hermetic sandbox. We pre-seed an autoconf cache file with
//! known x86_64-linux-gnu values.
//!
//! Optional deps not included: lz4, xxhash (not yet packaged).
//!
//! Output provides: rsync.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { rsyncSourceRecipe } from "./rsync-source.js";
import { opensslRecipe } from "../openssl/openssl.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { zstdRecipe } from "../zstd/zstd.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["openssl", "zlib", "zstd"],
    libDeps: ["openssl", "zlib", "zstd"],
    pkgConfigDeps: ["openssl", "zlib", "zstd"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

# Point to dependencies
export CPPFLAGS="-I/deps/openssl/include -I/deps/zlib/include -I/deps/zstd/include"
export LDFLAGS="$HOD_DUMMY_RPATH -L/deps/openssl/lib -L/deps/zlib/lib -L/deps/zstd/lib"
export PKG_CONFIG_PATH="/deps/openssl/lib/pkgconfig:/deps/zlib/lib/pkgconfig:/deps/zstd/lib/pkgconfig"

# Pre-seed autoconf cache with known x86_64-linux-gnu type sizes.
# configure.sh can't run test programs in the hermetic sandbox.
cat > config.cache <<'EOF'
ac_cv_sizeof_int=4
ac_cv_sizeof_long=8
ac_cv_sizeof_long_long=8
ac_cv_sizeof_short=2
ac_cv_sizeof_int16_t=2
ac_cv_sizeof_uint16_t=2
ac_cv_sizeof_int32_t=4
ac_cv_sizeof_uint32_t=4
ac_cv_sizeof_int64_t=8
ac_cv_sizeof_off_t=8
ac_cv_sizeof_off64_t=8
ac_cv_sizeof_time_t=8
ac_cv_sizeof_charp=8
EOF

./configure \\
  --prefix=/ \\
  -C \\
  --disable-debug \\
  --disable-lz4 \\
  --disable-xxhash \\
  --without-included-popt \\
  --without-included-zlib

make -j$(nproc)
make install DESTDIR=$OUT

# Strip binary
/deps/toolchain/bin/strip $OUT/bin/rsync 2>/dev/null || true

# Clean up
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/share $OUT/lib/*.la 2>/dev/null || true
`,
  deps: [
    dep("source", rsyncSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("openssl", opensslRecipe),
    dep("zlib", zlibRecipe),
    dep("zstd", zstdRecipe),
  ],
  runtime_deps: ["openssl", "toolchain", "zlib", "zstd"],
});

await importToStore(recipe);
export const rsyncRecipe = recipe;
