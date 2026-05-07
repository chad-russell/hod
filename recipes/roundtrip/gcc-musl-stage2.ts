//! Round-trip gcc-musl build — rebuilds GCC 14.2.0 targeting musl using
//! the native glibc toolchain.
//!
//! This is the core of Phase C.2: proving the native-toolchain (built by the
//! musl.cc seed) can itself build a full GCC targeting musl. If this works
//! and the resulting toolchain produces correct binaries, we've proven the
//! native compiler is a correct compiler — it can reproduce its own bootstrap.
//!
//! Architecture: this is a cross-compilation (host=glibc, target=musl).
//! The native gcc runs on glibc but produces musl-linked output. We use
//! the round-trip musl and binutils as the target C library and tools.
//!
//! IMPORTANT: We use process() directly instead of shellBuild() because
//! the roundtrip needs a custom preamble that doesn't symlink all of the
//! toolchain's lib/ into /lib/ (which conflicts with glibc's libc.so
//! linker script). Instead, we set up only the dynamic linker and use
//! static linking for the host compiler's own build tools.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { nativeToolchainRecipe } from "../toolchain/native-toolchain.js";
import { gccSourceRecipe } from "../bootstrap/gcc-source.js";
import { muslBuildStage2Recipe } from "./musl-build-stage2.js";
import { binutilsMuslStage2Recipe } from "./binutils-musl-stage2.js";
import { gmpRecipe } from "../cross/gmp.js";
import { mpfrRecipe } from "../cross/mpfr.js";
import { mpcRecipe } from "../cross/mpc.js";

// Custom preamble: only set up the dynamic linker, don't symlink all of lib/
const preamble = `
export PATH="/deps/toolchain/bin:$PATH"
export HOD_SHELL_BUSYBOX="/deps/toolchain/bin/busybox"
"$HOD_SHELL_BUSYBOX" ln -sf /deps/toolchain/bin/busybox /bin/sh || true
"$HOD_SHELL_BUSYBOX" mkdir -p /lib64 /lib
"$HOD_SHELL_BUSYBOX" ln -sf /deps/toolchain/sysroot/lib/ld-linux-x86-64.so.2 /lib64/ld-linux-x86-64.so.2 || true
"$HOD_SHELL_BUSYBOX" ln -sf /deps/toolchain/sysroot/lib/ld-linux-x86-64.so.2 /lib/ld-linux-x86-64.so.2 || true
# Symlink glibc runtime libraries into /lib/ for the dynamic linker.
# Exclude libc.so (glibc linker script, not ELF) — the dynamic linker
# uses libc.so.6, not libc.so.
for lib in /deps/toolchain/sysroot/lib/*.so*; do
  name="\${lib##*/}"
  case "$name" in libc.so) continue ;; esac
  "$HOD_SHELL_BUSYBOX" ln -sf "$lib" "/lib/$name" 2>/dev/null || true
done
`;

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/toolchain/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

${preamble}

export PATH=/deps/toolchain/bin:/deps/binutils/bin:$PATH

CC="/deps/toolchain/bin/gcc --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"
CXX="/deps/toolchain/bin/g++ --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"

# Verify the host compiler can compile and run
echo "int main(){return 0;}" > /tmp/hosttest.c
$CC /tmp/hosttest.c -o /tmp/hosttest 2>&1 || { echo "FATAL: host gcc can't compile dynamically"; exit 1; }
/tmp/hosttest 2>&1 || { echo "FATAL: host gcc output can't run"; exit 1; }
echo "Host compiler works."

# Extract GCC source
tar xf /deps/source/source -C /tmp
cd /tmp/gcc-14.2.0

# Patch: install libraries to /lib/ not /lib64/
sed -e '/m64=/s/lib64/lib/' -i gcc/config/i386/t-linux64

# Build in a separate directory (required for GCC)
mkdir -p /tmp/gcc-build
cd /tmp/gcc-build

# Create target sysroot with musl headers and libs
mkdir -p /tmp/sysroot/include /tmp/sysroot/lib
cp -a /deps/musl/include/. /tmp/sysroot/include/
cp -a /deps/musl/lib/. /tmp/sysroot/lib/

# Configure GCC as a cross-compiler: host=glibc, target=musl.
/tmp/gcc-14.2.0/configure \\
  --build=x86_64-pc-linux-gnu \\
  --host=x86_64-pc-linux-gnu \\
  --target=x86_64-linux-musl \\
  --prefix=/ \\
  --enable-languages=c,c++ \\
  --disable-nls \\
  --disable-multilib \\
  --disable-bootstrap \\
  --disable-fixincludes \\
  --disable-libsanitizer \\
  --disable-lto \\
  --disable-gnu-indirect-function \\
  --enable-tls \\
  --enable-initfini-array \\
  --enable-libstdcxx-time=rt \\
  CC="$CC" \\
  CXX="$CXX" \\
  AR=ar \\
  RANLIB=ranlib \\
  CFLAGS="-O2" \\
  CXXFLAGS="-O2" \\
  --with-gmp=/deps/gmp \\
  --with-mpfr=/deps/mpfr \\
  --with-mpc=/deps/mpc \\
  --with-sysroot=/tmp/sysroot \\
  AS_FOR_TARGET=/deps/binutils/bin/x86_64-linux-musl-as \\
  LD_FOR_TARGET=/deps/binutils/bin/x86_64-linux-musl-ld.bfd \\
  AR_FOR_TARGET=/deps/binutils/bin/x86_64-linux-musl-ar \\
  NM_FOR_TARGET=/deps/binutils/bin/x86_64-linux-musl-nm \\
  RANLIB_FOR_TARGET=/deps/binutils/bin/x86_64-linux-musl-ranlib \\
  STRIP_FOR_TARGET=/deps/binutils/bin/x86_64-linux-musl-strip \\
  OBJDUMP_FOR_TARGET=/deps/binutils/bin/x86_64-linux-musl-objdump \\
  OBJCOPY_FOR_TARGET=/deps/binutils/bin/x86_64-linux-musl-objcopy

# Workaround: fixincludes needs /usr/include
mkdir -p /usr/include

# No-op fixinc.sh
mkdir -p build-x86_64-pc-linux-gnu/fixincludes
printf '#!/bin/sh\\ntrue\\n' > build-x86_64-pc-linux-gnu/fixincludes/fixinc.sh
chmod +x build-x86_64-pc-linux-gnu/fixincludes/fixinc.sh

# Build GCC (host tools only — no target env vars yet)
make -j$(nproc) all-gcc

# Build target libraries with musl include/library paths
# These are set ONLY for target builds so the host compiler isn't confused.
make -j$(nproc) all-target-libgcc \
  C_INCLUDE_PATH=/deps/musl/include \
  CPLUS_INCLUDE_PATH=/deps/musl/include \
  LIBRARY_PATH=/deps/musl/lib:/deps/gmp/lib:/deps/mpfr/lib:/deps/mpc/lib
make -j$(nproc) all-target-libstdc++-v3 \
  C_INCLUDE_PATH=/deps/musl/include \
  CPLUS_INCLUDE_PATH=/deps/musl/include \
  LIBRARY_PATH=/deps/musl/lib:/deps/gmp/lib:/deps/mpfr/lib:/deps/mpc/lib

# Selective install
cd gcc && make install-driver install-common install-headers-tar install-mkheaders install-gcc-ar DESTDIR=$OUT && cd ..
make install-target-libgcc install-target-libstdc++-v3 DESTDIR=$OUT

# === Merge musl headers and runtime into the gcc output ===
echo "=== Merging musl headers into gcc output ==="
cp -a /deps/musl/include/. $OUT/include/

echo "=== Merging musl runtime into gcc output ==="
cp -a /deps/musl/lib/. $OUT/lib/

# Create the x86_64-linux-musl sysroot structure
mkdir -p $OUT/x86_64-linux-musl/lib
cp -a /deps/musl/lib/. $OUT/x86_64-linux-musl/lib/

# Verify key outputs
echo "=== Round-trip GCC build output verification ==="
ls -la $OUT/bin/x86_64-linux-musl-gcc || { echo "ERROR: gcc missing"; exit 1; }
ls -la $OUT/bin/x86_64-linux-musl-g++ || { echo "ERROR: g++ missing"; exit 1; }
ls -la $OUT/libexec/gcc/x86_64-linux-musl/*/cc1 || { echo "ERROR: cc1 missing"; exit 1; }
ls -la $OUT/lib/gcc/x86_64-linux-musl/*/libgcc.a || { echo "ERROR: libgcc.a missing"; exit 1; }
ls -la $OUT/include/stdio.h || { echo "ERROR: musl stdio.h missing"; exit 1; }
ls -la $OUT/lib/libc.so || { echo "ERROR: musl libc.so missing"; exit 1; }
ls -la $OUT/lib/crt1.o || { echo "ERROR: musl crt1.o missing"; exit 1; }
echo "=== All key GCC outputs present ==="
`,
  ],
  env: [
    { key: "C_INCLUDE_PATH", value: "" },
    { key: "CPLUS_INCLUDE_PATH", value: "" },
    { key: "LIBRARY_PATH", value: "/deps/toolchain/sysroot/lib:/deps/gmp/lib:/deps/mpfr/lib:/deps/mpc/lib" },
  ],
  dependencies: [
    dep("binutils", binutilsMuslStage2Recipe),
    dep("gmp", gmpRecipe),
    dep("mpc", mpcRecipe),
    dep("mpfr", mpfrRecipe),
    dep("musl", muslBuildStage2Recipe),
    dep("source", gccSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
});

await importToStore(recipe);
export const gccMuslStage2Recipe = recipe;
