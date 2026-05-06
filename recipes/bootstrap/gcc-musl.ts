//! gcc musl build from source.
//!
//! Builds GCC 14.2.0 targeting x86_64-linux-musl using:
//!   - Seed's musl gcc as the bootstrap (host) compiler
//!   - Hod-built musl libc from Phase 1 (target C library)
//!   - Hod-built binutils from Phase 2 (target assembler/linker)
//!
//! This is a native build (build=host=target=x86_64-linux-musl): the resulting
//! gcc runs on musl and produces musl binaries.
//!
//! The output is self-contained: musl's headers, C runtime (crt*.o), libc,
//! and dynamic linker are merged into the gcc output tree. This matches the
//! musl.cc toolchain layout and ensures that GCC's C++ compiler can find
//! system headers through its store-relative search paths.
//!
//! The output is designed to be composable with binutils-musl in Phase 4
//! (hod-musl-toolchain assembly) — no separate musl dep needed.
//!
//! IMPORTANT: This is a slow build (~5 min). It compiles all of GCC's
//! internal subprograms (cc1, cc1plus, collect2, etc.), libgcc, libstdc++,
//! and the target runtime libraries.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { seedRootRecipe } from "./seed-root.js";
import { gccSourceRecipe } from "./gcc-source.js";
import { muslBuildRecipe } from "./musl-build.js";
import { binutilsMuslRecipe } from "./binutils-musl.js";
import { makeRecipe as shimMakeRecipe } from "../shims/make.js";
import { gmpRecipe } from "../cross/gmp.js";
import { mpfrRecipe } from "../cross/mpfr.js";
import { mpcRecipe } from "../cross/mpc.js";

const preamble = hermeticPreamble({
  shell: "seed",
  muslLinker: "seed",
});

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

${preamble}

export PATH=/tmp/gcc-wrapper:/deps/make/bin:/deps/binutils/bin:/deps/seed/bin
MAKE=/deps/make/bin/make

# The seed musl gcc has hardcoded paths from the host staging directory.
# Create a wrapper that uses -B flags to point at the right subprograms.
mkdir -p /tmp/gcc-wrapper
cat > /tmp/gcc-wrapper/gcc << 'WRAPPER'
#!/bin/sh
exec /deps/seed/bin/gcc \\
  -B/deps/seed/libexec/gcc/x86_64-linux-musl/11.2.1/ \\
  -B/deps/seed/lib/gcc/x86_64-linux-musl/11.2.1/ \\
  -B/deps/seed/x86_64-linux-musl/lib/ \\
  -I/deps/seed/include \\
  -L/deps/seed/lib \\
  "$@"
WRAPPER
chmod +x /tmp/gcc-wrapper/gcc

# Also create g++ wrapper (needed for GCC's own C++ sources like cc1plus)
cat > /tmp/gcc-wrapper/g++ << 'WRAPPER'
#!/bin/sh
exec /deps/seed/bin/g++ \\
  -B/deps/seed/libexec/gcc/x86_64-linux-musl/11.2.1/ \\
  -B/deps/seed/lib/gcc/x86_64-linux-musl/11.2.1/ \\
  -B/deps/seed/x86_64-linux-musl/lib/ \\
  -I/deps/seed/include \\
  -L/deps/seed/lib \\
  "$@"
WRAPPER
chmod +x /tmp/gcc-wrapper/g++

# Verify wrappers
/tmp/gcc-wrapper/gcc --version | head -1

# Extract GCC source
tar xf /deps/source/source -C /tmp
cd /tmp/gcc-14.2.0

# Patch: install libraries to /lib/ not /lib64/
sed -e '/m64=/s/lib64/lib/' -i gcc/config/i386/t-linux64

# Build in a separate directory (required for GCC)
mkdir -p /tmp/gcc-build
cd /tmp/gcc-build

# Configure GCC as a native x86_64-linux-musl compiler.
# This is NOT a cross-compiler: build=host=target.
# The resulting gcc runs on musl and targets musl.
#
# Key flags:
#   --enable-languages=c,c++   Build C and C++ compilers
#   --disable-multilib         No 32-bit support needed
#   --disable-bootstrap        Single-stage build (seed compiler is trusted)
#   --disable-nls              No locale/translation
#   --disable-fixincludes      Don't fix system headers (we provide our own)
#   --disable-libsanitizer     Avoids complex host dependencies
#
# Target tools: use Hod-built binutils
# C library paths: use Hod-built musl
/tmp/gcc-14.2.0/configure \\
  --build=x86_64-linux-musl \\
  --host=x86_64-linux-musl \\
  --target=x86_64-linux-musl \\
  --prefix=/ \\
  --enable-languages=c,c++ \\
  --disable-nls \\
  --disable-multilib \\
  --disable-bootstrap \\
  --disable-fixincludes \\
  --disable-libsanitizer \\
  --disable-lto \
  --disable-gnu-indirect-function \\
  --enable-tls \\
  --enable-initfini-array \\
  --enable-libstdcxx-time=rt \\
  CC=/tmp/gcc-wrapper/gcc \\
  CXX=/tmp/gcc-wrapper/g++ \\
  AR=/deps/seed/bin/ar \\
  RANLIB=/deps/seed/bin/ranlib \\
  CFLAGS="-O2" \\
  CXXFLAGS="-O2" \\
  --with-gmp=/deps/gmp \\
  --with-mpfr=/deps/mpfr \\
  --with-mpc=/deps/mpc \\
  AS_FOR_TARGET=/deps/binutils/bin/x86_64-linux-musl-as \\
  LD_FOR_TARGET=/deps/binutils/bin/x86_64-linux-musl-ld.bfd \\
  AR_FOR_TARGET=/deps/binutils/bin/x86_64-linux-musl-ar \\
  NM_FOR_TARGET=/deps/binutils/bin/x86_64-linux-musl-nm \\
  RANLIB_FOR_TARGET=/deps/binutils/bin/x86_64-linux-musl-ranlib \\
  STRIP_FOR_TARGET=/deps/binutils/bin/x86_64-linux-musl-strip \\
  OBJDUMP_FOR_TARGET=/deps/binutils/bin/x86_64-linux-musl-objdump \\
  OBJCOPY_FOR_TARGET=/deps/binutils/bin/x86_64-linux-musl-objcopy

# Workaround: GCC's fixincludes scans /usr/include. Create an empty one so it
# finds nothing and succeeds. (The musl headers are provided separately.)
mkdir -p /usr/include

# Also create a no-op fixinc.sh to prevent any header patching.
mkdir -p build-x86_64-linux-musl/fixincludes
printf '#!/bin/sh\ntrue\n' > build-x86_64-linux-musl/fixincludes/fixinc.sh
chmod +x build-x86_64-linux-musl/fixincludes/fixinc.sh

# Build GCC and target libraries
$MAKE -j$(nproc) all-gcc
$MAKE -j$(nproc) all-target-libgcc
$MAKE -j$(nproc) all-target-libstdc++-v3

# Selective install (full 'make install' can fail on unbuilt fortran/go/etc)
cd gcc && $MAKE install-driver install-common install-headers-tar install-mkheaders install-gcc-ar DESTDIR=$OUT && cd ..
$MAKE install-target-libgcc install-target-libstdc++-v3 DESTDIR=$OUT

# === Merge musl headers and runtime into the gcc output ===
#
# The musl.cc toolchain is a self-contained directory with GCC's own files
# plus the C library headers and runtime. Our built GCC's C++ compiler
# only searches its own output tree for system headers (via store-relative
# paths like lib/gcc/../../include). Without musl headers there, C++
# compilation fails (can't find wchar.h etc.).
#
# Copying musl's files into the gcc output makes it self-contained,
# matching the musl.cc layout and enabling both C and C++ compilation.

echo "=== Merging musl headers into gcc output ==="
# Copy musl C headers alongside GCC's C++ headers in include/
cp -a /deps/musl/include/. $OUT/include/

echo "=== Merging musl runtime into gcc output ==="
# Copy ALL musl libs (libc, libm, libpthread, libdl, crt*.o, ld-musl, etc.)
# Musl provides stub static libs for POSIX separation (-lm, -lpthread, etc.)
# that GCC's default link flags expect to find.
cp -a /deps/musl/lib/. $OUT/lib/

# Also create the x86_64-linux-musl sysroot structure (matches musl.cc layout)
mkdir -p $OUT/x86_64-linux-musl/lib
cp -a /deps/musl/lib/. $OUT/x86_64-linux-musl/lib/

# Verify key outputs
echo "=== GCC build output verification ==="
ls -la $OUT/bin/x86_64-linux-musl-gcc || { echo "ERROR: gcc missing"; exit 1; }
ls -la $OUT/bin/x86_64-linux-musl-g++ || { echo "ERROR: g++ missing"; exit 1; }
ls -la $OUT/bin/gcc || { echo "ERROR: unprefixed gcc missing"; exit 1; }
ls -la $OUT/libexec/gcc/x86_64-linux-musl/*/cc1 || { echo "ERROR: cc1 missing"; exit 1; }
ls -la $OUT/lib/gcc/x86_64-linux-musl/*/libgcc.a || { echo "ERROR: libgcc.a missing"; exit 1; }
ls -la $OUT/include/stdio.h || { echo "ERROR: musl stdio.h missing"; exit 1; }
ls -la $OUT/include/wchar.h || { echo "ERROR: musl wchar.h missing"; exit 1; }
ls -la $OUT/lib/libc.so || { echo "ERROR: musl libc.so missing"; exit 1; }
ls -la $OUT/lib/crt1.o || { echo "ERROR: musl crt1.o missing"; exit 1; }
ls -la $OUT/lib/libm.a || { echo "ERROR: musl libm.a missing"; exit 1; }
ls -la $OUT/lib/ld-musl-x86_64.so.1 || { echo "ERROR: musl ld-musl missing"; exit 1; }
echo "=== All key GCC outputs present ==="`,
  ],
  env: [
    { key: "CPLUS_INCLUDE_PATH", value: "/deps/musl/include:/deps/seed/include:/deps/seed/include/c++/11.2.1" },
    { key: "C_INCLUDE_PATH", value: "/deps/musl/include:/deps/seed/include" },
    { key: "LIBRARY_PATH", value: "/deps/musl/lib:/deps/seed/lib:/deps/seed/lib/gcc/x86_64-linux-musl/11.2.1" },
  ],
  dependencies: [
    dep("binutils", binutilsMuslRecipe),
    dep("gmp", gmpRecipe),
    dep("make", shimMakeRecipe),
    dep("mpc", mpcRecipe),
    dep("mpfr", mpfrRecipe),
    dep("musl", muslBuildRecipe),
    dep("seed", seedRootRecipe),
    dep("source", gccSourceRecipe),
  ],
});

await importToStore(recipe);
export const gccMuslRecipe = recipe;
