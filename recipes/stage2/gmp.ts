//! stage2 GMP — static library built by gcc-stage1 targeting glibc.
//!
//! This produces a glibc-hosted static GMP library for use by gcc-stage2.
//! Unlike cross/gmp which is built with the seed musl toolchain,
//! this is built with gcc-stage1 cross-compiling to glibc.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { hodSeedRootRecipe } from "../bootstrap/hod-seed-root.js";
import { shimsBundleRecipe } from "../shims/shims-bundle.js";
import { gccStage1Recipe } from "../cross/gcc-stage1.js";
import { binutilsRecipe } from "../native/binutils.js";
import { glibcRecipe } from "../cross/glibc.js";
import { linuxHeadersRecipe } from "../cross/linux-headers.js";
import { gmpSourceRecipe } from "../cross/gmp-source.js";

const preamble = hermeticPreamble({
  shims: "shims",
  shell: "seed",
  muslLinker: "seed",
  glibcLinker: "glibc",
  sysroot: { glibc: "glibc", linuxHeaders: "linux-headers" },
});

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

${preamble}

tar xf /deps/source/source -C /tmp
cd /tmp/gmp-6.3.0

# GCC-stage1 was configured with --prefix=/opt/gcc and bakes that path
# into its specs. Create the expected directory layout so it can find
# its internal headers, crt objects, and libgcc.
mkdir -p /opt/gcc/lib/gcc/x86_64-linux-gnu/13.2.0/include
cp -a /deps/gcc-stage1/lib/gcc/x86_64-linux-gnu/13.2.0/include/. /opt/gcc/lib/gcc/x86_64-linux-gnu/13.2.0/include/
cp -a /deps/gcc-stage1/lib/gcc/x86_64-linux-gnu/13.2.0/*.o /opt/gcc/lib/gcc/x86_64-linux-gnu/13.2.0/ 2>/dev/null || true
cp -a /deps/gcc-stage1/lib/libgcc_s.so* /opt/gcc/lib/ 2>/dev/null || true
mkdir -p /opt/gcc/x86_64-linux-gnu/include
cp -a /tmp/sysroot/include/. /opt/gcc/x86_64-linux-gnu/include/

CC_FOR_BUILD="/deps/seed/bin/gcc -L/deps/seed/lib -I/deps/seed/include" \\
CC="/deps/gcc-stage1/bin/x86_64-linux-gnu-gcc --sysroot=/tmp/sysroot -B/deps/binutils/bin -static-libgcc -isystem /tmp/sysroot/include" \\
AR=/deps/binutils/bin/ar \\
RANLIB=/deps/binutils/bin/ranlib \\
NM=/deps/binutils/bin/nm \\
CFLAGS="-O2" \\
./configure \\
  --build=x86_64-linux-musl \\
  --host=x86_64-linux-gnu \\
  --prefix=/ \\
  --disable-shared \\
  --enable-static \\
  --disable-cxx

/deps/shims/bin/make -j$(nproc)
/deps/shims/bin/make install DESTDIR=$OUT

# Remove libtool archives
find $OUT -name '*.la' -delete`,
  ],
  env: [
    // Explicit empty values to prevent conflicting header paths.
    // CC_FOR_BUILD gets seed headers via the musl toolchain's built-in paths.
    // The cross-compiler gets glibc headers via -isystem.
    { key: "C_INCLUDE_PATH", value: "" },
    { key: "LIBRARY_PATH", value: "/tmp/sysroot/lib" },
  ],
  dependencies: [
    dep("binutils", binutilsRecipe),
    dep("gcc-stage1", gccStage1Recipe),
    dep("glibc", glibcRecipe),
    dep("linux-headers", linuxHeadersRecipe),
    dep("seed", hodSeedRootRecipe),
    dep("shims", shimsBundleRecipe),
    dep("source", gmpSourceRecipe),
  ],
});

await importToStore(recipe);
export const gmpStage2Recipe = recipe;
