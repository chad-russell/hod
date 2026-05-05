//! stage2 GMP — static library built by gcc-stage1 targeting glibc.
//!
//! This produces a glibc-hosted static GMP library for use by gcc-stage2.
//! Unlike cross/gmp which is built with the seed musl toolchain,
//! this is built with gcc-stage1 cross-compiling to glibc.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { seedRootRecipe } from "../bootstrap/seed-root.js";
import { shimsBundleRecipe } from "../shims/shims-bundle.js";
import { gccStage1Recipe } from "../cross/gcc-stage1.js";
import { binutilsRecipe } from "../native/binutils.js";
import { glibcRecipe } from "../cross/glibc.js";
import { linuxHeadersRecipe } from "../cross/linux-headers.js";
import { gmpSourceRecipe } from "../cross/gmp-source.js";

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

tar xf /deps/source/source -C /tmp
cd /tmp/gmp-6.3.0

CC="/deps/gcc-stage1/bin/x86_64-linux-gnu-gcc --sysroot=/tmp/sysroot -B/deps/binutils/bin" \\
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
/deps/shims/bin/make install DESTDIR=$OUT`,
  ],
  dependencies: [
    dep("binutils", binutilsRecipe),
    dep("gcc-stage1", gccStage1Recipe),
    dep("glibc", glibcRecipe),
    dep("linux-headers", linuxHeadersRecipe),
    dep("seed", seedRootRecipe),
    dep("shims", shimsBundleRecipe),
    dep("source", gmpSourceRecipe),
  ],
});

await importToStore(recipe);
export const gmpStage2Recipe = recipe;
