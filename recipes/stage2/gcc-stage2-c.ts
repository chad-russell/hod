//! gcc-stage2-c — C-only native compiler built by gcc-stage1, running on glibc.
//!
//! This is the key transition from bootstrap to native:
//!   build  = x86_64-linux-musl  (built in the musl/seed world)
//!   host   = x86_64-linux-gnu   (runs on glibc)
//!   target = x86_64-linux-gnu   (produces glibc-targeting code)
//!
//! Uses stage2 GMP/MPFR/MPC (glibc-hosted static libs) and Hod-built binutils.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { seedRootRecipe } from "../bootstrap/seed-root.js";
import { shimsBundleRecipe } from "../shims/shims-bundle.js";
import { gccStage1Recipe } from "../cross/gcc-stage1.js";
import { binutilsRecipe } from "../native/binutils.js";
import { glibcRecipe } from "../cross/glibc.js";
import { linuxHeadersRecipe } from "../cross/linux-headers.js";
import { gmpStage2Recipe } from "./gmp.js";
import { mpfrStage2Recipe } from "./mpfr.js";
import { mpcStage2Recipe } from "./mpc.js";
import { gccStage1SourceRecipe } from "../cross/gcc-stage1-source.js";

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

# === Extract GCC source ===
tar xf /deps/source/source -C /tmp
cd /tmp/gcc-13.2.0

# Patch: install libraries to /lib/ not /lib64/
sed -e '/m64=/s/lib64/lib/' -i gcc/config/i386/t-linux64

# === Create target include dirs at the absolute path GCC bakes into specs ===
# With --prefix=/opt/gcc and --target=x86_64-linux-gnu, GCC bakes
# -isystem /opt/gcc/x86_64-linux-gnu/{include,sys-include} into xgcc's specs.
# These are NOT remapped by --sysroot, so they must exist with headers.
mkdir -p /opt/gcc/x86_64-linux-gnu/include
mkdir -p /opt/gcc/x86_64-linux-gnu/sys-include
cp -a /tmp/sysroot/include/. /opt/gcc/x86_64-linux-gnu/include/
cp -a /tmp/sysroot/include/. /opt/gcc/x86_64-linux-gnu/sys-include/

# === Build ===
mkdir build
cd build

CC="/deps/gcc-stage1/bin/x86_64-linux-gnu-gcc --sysroot=/tmp/sysroot -B/deps/binutils/bin" \\
CXX="/deps/gcc-stage1/bin/x86_64-linux-gnu-g++ --sysroot=/tmp/sysroot -B/deps/binutils/bin" \\
AR=/deps/binutils/bin/ar \\
RANLIB=/deps/binutils/bin/ranlib \\
NM=/deps/binutils/bin/nm \\
LD=/deps/binutils/bin/ld \\
AS=/deps/binutils/bin/as \\
STRIP=/deps/binutils/bin/strip \\
OBJDUMP=/deps/binutils/bin/objdump \\
OBJCOPY=/deps/binutils/bin/objcopy \\
AR_FOR_TARGET=/deps/binutils/bin/ar \\
RANLIB_FOR_TARGET=/deps/binutils/bin/ranlib \\
NM_FOR_TARGET=/deps/binutils/bin/nm \\
LD_FOR_TARGET=/deps/binutils/bin/ld \\
AS_FOR_TARGET=/deps/binutils/bin/as \\
STRIP_FOR_TARGET=/deps/binutils/bin/strip \\
OBJDUMP_FOR_TARGET=/deps/binutils/bin/objdump \\
OBJCOPY_FOR_TARGET=/deps/binutils/bin/objcopy \\
../configure \\
  --build=x86_64-linux-musl \\
  --host=x86_64-linux-gnu \\
  --target=x86_64-linux-gnu \\
  --prefix=/opt/gcc \\
  --enable-languages=c \\
  --enable-default-pie \\
  --enable-default-ssp \\
  --disable-nls \\
  --disable-multilib \\
  --disable-bootstrap \\
  --disable-fixincludes \\
  --disable-libsanitizer \\
  --disable-lto \\
  --with-gmp=/deps/gmp \\
  --with-mpfr=/deps/mpfr \\
  --with-mpc=/deps/mpc \\
  --with-build-sysroot=/tmp/sysroot

/deps/shims/bin/make -j$(nproc) all-gcc
/deps/shims/bin/make -j$(nproc) all-target-libgcc

# === Install ===
cd gcc
/deps/shims/bin/make install-driver install-common install-headers-tar install-mkheaders install-gcc-ar DESTDIR=$OUT
cd ..

/deps/shims/bin/make install-target-libgcc DESTDIR=$OUT

# Flatten: move opt/gcc/* to top level
cp -a $OUT/opt/gcc/. $OUT/
rm -rf $OUT/opt

# Move target-specific lib and include to top level
if [ -d "$OUT/x86_64-linux-gnu/lib" ]; then
  mkdir -p $OUT/lib
  cp -a $OUT/x86_64-linux-gnu/lib/. $OUT/lib/ 2>/dev/null || true
fi
if [ -d "$OUT/x86_64-linux-gnu/include" ]; then
  mkdir -p $OUT/include
  cp -a $OUT/x86_64-linux-gnu/include/. $OUT/include/ 2>/dev/null || true
fi
rm -rf $OUT/x86_64-linux-gnu

# Convenience symlinks
mkdir -p $OUT/bin
if [ -x $OUT/bin/x86_64-linux-gnu-gcc ]; then
  ln -sf x86_64-linux-gnu-gcc $OUT/bin/gcc
  ln -sf gcc $OUT/bin/cc
fi`,
  ],
  env: [
    { key: "C_INCLUDE_PATH", value: "/deps/gmp/include:/deps/mpfr/include:/deps/mpc/include" },
    { key: "LIBRARY_PATH", value: "/deps/gmp/lib:/deps/mpfr/lib:/deps/mpc/lib" },
  ],
  dependencies: [
    dep("binutils", binutilsRecipe),
    dep("gcc-stage1", gccStage1Recipe),
    dep("glibc", glibcRecipe),
    dep("gmp", gmpStage2Recipe),
    dep("linux-headers", linuxHeadersRecipe),
    dep("mpc", mpcStage2Recipe),
    dep("mpfr", mpfrStage2Recipe),
    dep("seed", seedRootRecipe),
    dep("shims", shimsBundleRecipe),
    dep("source", gccStage1SourceRecipe),
  ],
});

await importToStore(recipe);
export const gccStage2CRecipe = recipe;
