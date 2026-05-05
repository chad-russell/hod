//! stage2 MPFR — static library built by gcc-stage1 targeting glibc.
//!
//! Depends on stage2 GMP. Produces a glibc-hosted static MPFR library
//! for use by gcc-stage2.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { seedRootRecipe } from "../bootstrap/seed-root.js";
import { shimsBundleRecipe } from "../shims/shims-bundle.js";
import { gccStage1Recipe } from "../cross/gcc-stage1.js";
import { binutilsRecipe } from "../native/binutils.js";
import { glibcRecipe } from "../cross/glibc.js";
import { linuxHeadersRecipe } from "../cross/linux-headers.js";
import { gmpStage2Recipe } from "./gmp.js";
import { mpfrSourceRecipe } from "../cross/mpfr-source.js";

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
cd /tmp/mpfr-4.2.0

# Fix test source file (from LFS / brioche)
sed \\
  -e 's/+01,234,567/+1,234,567 /' \\
  -e 's/13.10Pd/13Pd/' \\
  -i tests/tsprintf.c

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
  --enable-thread-safe \\
  --with-gmp=/deps/gmp

/deps/shims/bin/make -j$(nproc)
/deps/shims/bin/make install DESTDIR=$OUT`,
  ],
  dependencies: [
    dep("binutils", binutilsRecipe),
    dep("gcc-stage1", gccStage1Recipe),
    dep("glibc", glibcRecipe),
    dep("gmp", gmpStage2Recipe),
    dep("linux-headers", linuxHeadersRecipe),
    dep("seed", seedRootRecipe),
    dep("shims", shimsBundleRecipe),
    dep("source", mpfrSourceRecipe),
  ],
});

await importToStore(recipe);
export const mpfrStage2Recipe = recipe;
