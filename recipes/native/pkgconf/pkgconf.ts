//! pkgconf native build recipe — lightweight pkg-config replacement.
//!
//! Builds pkgconf as a static binary using the bootstrap toolchain (gcc-stage1),
//! so it can be included in the native-toolchain bundle without a circular dependency.
//! Provides both `pkgconf` and a `pkg-config` symlink for drop-in compatibility.
import { process, dep, importToStore, hermeticPreamble } from "../../../js/src/index.js";
import { hodSeedRootRecipe } from "../../bootstrap/hod-seed-root.js";
import { shimsBundleRecipe } from "../../shims/shims-bundle.js";
import { gccStage1Recipe } from "../../cross/gcc-stage1.js";
import { glibcRecipe } from "../../cross/glibc.js";
import { linuxHeadersRecipe } from "../../cross/linux-headers.js";
import { pkgconfSourceRecipe } from "./pkgconf-source.js";

const preamble = hermeticPreamble({
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

cp -a /deps/source/. /tmp/build
cd /tmp/build
cd /tmp/build

export PATH=/tmp/cross-bin:/deps/gcc-stage1/bin:/deps/seed/bin:/deps/shims/bin
mkdir -p /tmp/cross-bin
ln -sf /deps/seed/bin/ar /tmp/cross-bin/x86_64-linux-gnu-ar
ln -sf /deps/seed/bin/ranlib /tmp/cross-bin/x86_64-linux-gnu-ranlib
ln -sf /deps/seed/bin/nm /tmp/cross-bin/x86_64-linux-gnu-nm
ln -sf /deps/seed/bin/objdump /tmp/cross-bin/x86_64-linux-gnu-objdump
ln -sf /deps/seed/bin/strip /tmp/cross-bin/x86_64-linux-gnu-strip

CC="x86_64-linux-gnu-gcc --sysroot=/tmp/sysroot -B/deps/seed/bin/" \\
AR=/deps/seed/bin/ar \\
RANLIB=/deps/seed/bin/ranlib \\
STRIP=/deps/seed/bin/strip \\
NM=/deps/seed/bin/nm \\
CFLAGS="-O2" \\
LDFLAGS="-static -L/deps/gcc-stage1/lib -L/deps/gcc-stage1/lib/gcc/x86_64-linux-gnu/13.2.0" \\
./configure \\
  --prefix=/ \\
  --build=x86_64-linux-musl \\
  --host=x86_64-linux-gnu \\
  --disable-dependency-tracking \\
  --with-pkg-config-dir=/deps/pkgconfig \\
  --with-system-includedir=/tmp/sysroot/include \\
  --with-system-libdir=/tmp/sysroot/lib

make -j$(nproc)
make install DESTDIR=$OUT

# Drop-in compatibility symlink so packages calling pkg-config work
ln -sf pkgconf $OUT/bin/pkg-config`,
  ],
  env: [
    { key: "C_INCLUDE_PATH", value: "/deps/gcc-stage1/include:/deps/glibc/include:/deps/linux-headers/include" },
    { key: "LIBRARY_PATH", value: "/deps/glibc/lib:/deps/gcc-stage1/lib:/deps/gcc-stage1/lib/gcc/x86_64-linux-gnu/13.2.0" },
  ],
  dependencies: [
    dep("gcc-stage1", gccStage1Recipe),
    dep("glibc", glibcRecipe),
    dep("linux-headers", linuxHeadersRecipe),
    dep("seed", hodSeedRootRecipe),
    dep("shims", shimsBundleRecipe),
    dep("source", pkgconfSourceRecipe),
  ],
});

await importToStore(recipe);
export const pkgconfRecipe = recipe;
