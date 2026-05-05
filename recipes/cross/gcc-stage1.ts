//! gcc-stage1 cross-compilation recipe.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { seedRootRecipe } from "../bootstrap/seed-root.js";
import { shimsBundleRecipe } from "../shims/shims-bundle.js";
import { glibcRecipe } from "./glibc.js";
import { gmpRecipe } from "./gmp.js";
import { linuxHeadersRecipe } from "./linux-headers.js";
import { mpcRecipe } from "./mpc.js";
import { mpfrRecipe } from "./mpfr.js";
import { gccStage1SourceRecipe } from "./gcc-stage1-source.js";

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
cd /tmp/gcc-13.2.0

# Patch: install libraries to /lib/ not /lib64/
sed -e '/m64=/s/lib64/lib/' -i gcc/config/i386/t-linux64

# Create target include dirs at the absolute path GCC's cross-compiler expects.
# GCC bakes -isystem /opt/gcc/x86_64-linux-gnu/{include,sys-include} into xgcc's
# specs. These are NOT remapped by --sysroot, so they must exist at that
# literal path with the system headers present.
mkdir -p /opt/gcc/x86_64-linux-gnu/include
mkdir -p /opt/gcc/x86_64-linux-gnu/sys-include
cp -a /tmp/sysroot/include/. /opt/gcc/x86_64-linux-gnu/include/
cp -a /tmp/sysroot/include/. /opt/gcc/x86_64-linux-gnu/sys-include/

mkdir build
cd build

../configure \\
  --build=x86_64-linux-musl \\
  --host=x86_64-linux-musl \\
  --target=x86_64-linux-gnu \\
  --prefix=/opt/gcc \\
  --enable-languages=c,c++ \\
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
  --with-build-sysroot=/tmp/sysroot \\
  CC=/deps/seed/bin/gcc \\
  CXX=/deps/seed/bin/g++ \\
  AR=/deps/seed/bin/ar \\
  RANLIB=/deps/seed/bin/ranlib \\
  LD=/deps/seed/bin/ld.bfd \\
  AS_FOR_TARGET=/deps/seed/bin/as \\
  LD_FOR_TARGET=/deps/seed/bin/ld.bfd \\
  AR_FOR_TARGET=/deps/seed/bin/ar \\
  NM_FOR_TARGET=/deps/seed/bin/nm \\
  RANLIB_FOR_TARGET=/deps/seed/bin/ranlib \\
  STRIP_FOR_TARGET=/deps/seed/bin/strip \\
  OBJDUMP_FOR_TARGET=/deps/seed/bin/objdump \\
  OBJCOPY_FOR_TARGET=/deps/seed/bin/objcopy

make -j$(nproc) all-gcc
make -j$(nproc) all-target-libgcc
make -j$(nproc) all-target-libstdc++-v3

# Selective install (full 'make install' fails on unbuilt c++tools)
cd gcc && make install-driver install-common install-headers-tar install-mkheaders install-gcc-ar DESTDIR=$OUT && cd ..
make install-target-libgcc install-target-libstdc++-v3 DESTDIR=$OUT

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
rm -rf $OUT/x86_64-linux-gnu`,
  ],
  env: [
    { key: "C_INCLUDE_PATH", value: "/deps/seed/include:/deps/seed/x86_64-linux-musl/include" },
    { key: "LIBRARY_PATH", value: "/deps/seed/lib:/deps/seed/lib/gcc/x86_64-linux-musl/13:/deps/gmp/lib:/deps/mpfr/lib:/deps/mpc/lib" },
  ],
  dependencies: [
    dep("glibc", glibcRecipe),
    dep("gmp", gmpRecipe),
    dep("linux-headers", linuxHeadersRecipe),
    dep("mpc", mpcRecipe),
    dep("mpfr", mpfrRecipe),
    dep("seed", seedRootRecipe),
    dep("shims", shimsBundleRecipe),
    dep("source", gccStage1SourceRecipe),
  ],
});

await importToStore(recipe);
export const gccStage1Recipe = recipe;
