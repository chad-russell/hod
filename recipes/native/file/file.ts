//! file native build recipe — file type identification utility (libmagic).
//!
//! Builds file 5.46 with shared libmagic output (libmagic.so*).
//! Dependencies: zlib, bzip2, xz (all provide shared libs for magic database
//! compression support). Dynamically links glibc and all deps (relocated via
//! runtime_deps).

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { bzip2Recipe } from "../bzip2/bzip2.js";
import { xzRecipe } from "../xz/xz.js";
import { fileSourceRecipe } from "./file-source.js";

const recipe = await shellBuild({
  toolchain: "toolchain",
  script: `

# Extract source
tar xf /deps/source/source -C /tmp
cd /tmp/file-5.46

export LDFLAGS="$HOD_DUMMY_RPATH -L/deps/zlib/lib -L/deps/bzip2/lib -L/deps/xz/lib"
export CPPFLAGS="-I/deps/zlib/include -I/deps/bzip2/include -I/deps/xz/include"

# Allow the just-built 'file' binary to find shared deps during 'make' (needed for magic.mgc compilation)
export LD_LIBRARY_PATH=/deps/zlib/lib:/deps/bzip2/lib:/deps/xz/lib

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --disable-dependency-tracking \\
  --disable-lib-seccomp

make -j$(nproc)
make install DESTDIR=$OUT

# Strip binaries and shared libraries
/deps/toolchain/bin/strip $OUT/bin/file 2>/dev/null || true
find $OUT/lib -name 'lib*.so.*' -type f -exec /deps/toolchain/bin/strip --strip-unneeded {} + 2>/dev/null || true

# Clean up — keep lib/pkgconfig for downstream deps, remove docs/man/info
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/lib/*.la 2>/dev/null || true
# Remove share/ only if nothing useful remains
rmdir $OUT/share 2>/dev/null || true`,
  deps: [
    dep("source", fileSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("zlib", zlibRecipe),
    dep("bzip2", bzip2Recipe),
    dep("xz", xzRecipe),
  ],
  runtime_deps: ["bzip2", "toolchain", "xz", "zlib"],
});

await importToStore(recipe);
export const fileRecipe = recipe;
