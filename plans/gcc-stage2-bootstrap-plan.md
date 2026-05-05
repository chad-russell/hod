# GCC Stage 2 Bootstrap Plan

**Status:** Planning guide only — do not implement blindly  
**Goal:** Build a principled, native Hod-built GCC toolchain that downstream packages can use without directly depending on the bootstrap seed toolchain.

This document is intended for a future LLM or developer implementing the next phase of Hod's bootstrap chain.

---

## 1. Motivation

Current packages such as `ncurses` and `cbonsai` can be built successfully, but they directly depend on the bootstrap seed toolchain:

- `/deps/seed/bin/busybox` for `sh` and basic Unix utilities
- `/deps/seed/bin/gcc` for compilation
- `/deps/seed/bin/ar`, `/deps/seed/bin/ranlib`, etc. for binutils

This is not the desired long-term bootstrap shape.

The seed should be used only to build the most foundational Hod-built tools. Those Hod-built tools should then be used to build the rest of the ecosystem.

The desired structure is:

```text
Stage 0: Bootstrap seed
  - prebuilt busybox
  - prebuilt musl toolchain
  - used only to build foundational Hod-built tools

Stage 1: Existing bootstrap/cross infrastructure
  - glibc
  - linux-headers
  - gcc-stage1
  - binutils
  - shims: make, sed, m4, bison, gawk, patch
  - these may still use the seed internally

Stage 2: New native GCC
  - built by gcc-stage1
  - runs on glibc
  - targets glibc
  - final compiler should not be musl-hosted

Stage 3: Normal packages
  - ncurses
  - cbonsai
  - future ecosystem packages
  - depend on the native Hod-built toolchain, not seed
```

The immediate target is **Stage 2**: build a native glibc-hosted GCC.

---

## 2. Terminology

GCC uses three machine roles:

| Role | Meaning |
|------|---------|
| `build` | Machine where GCC is being built |
| `host` | Machine where the resulting GCC executable will run |
| `target` | Machine for which the resulting GCC will produce code |

For the new stage2 compiler, we want:

```text
build  = x86_64-linux-musl
host   = x86_64-linux-gnu
target = x86_64-linux-gnu
```

In configure flags:

```sh
--build=x86_64-linux-musl \
--host=x86_64-linux-gnu \
--target=x86_64-linux-gnu
```

This means:

- The current build environment is still the bootstrap/musl world.
- The produced compiler binary is a glibc executable.
- The produced compiler emits glibc-targeting binaries.

This is the key transition from bootstrap to native.

---

## 3. Current Relevant Recipes

Before implementing, inspect these recipes:

```text
recipes/bootstrap/seed-root.json
recipes/cross/gcc-stage1.json
recipes/cross/glibc.json
recipes/cross/linux-headers.json
recipes/cross/gmp.json
recipes/cross/mpfr.json
recipes/cross/mpc.json
recipes/native/binutils.json
recipes/shims/shims-bundle.json
recipes/shims/make.json
recipes/native/bash.json
recipes/native/coreutils.json
recipes/native/tar.json
recipes/native/sed.json
recipes/native/ncurses/ncurses.ts
recipes/native/cbonsai/cbonsai.ts
```

Important observations:

1. `gcc-stage1` is currently a cross compiler:

   ```text
   host   = x86_64-linux-musl
   target = x86_64-linux-gnu
   ```

   It runs in the bootstrap/musl world but emits glibc-targeting code.

2. `gcc-stage1` likely requires the musl dynamic linker at runtime:

   ```text
   /lib/ld-musl-x86_64.so.1
   ```

   This is acceptable while building stage2, but must not be a property of the final stage2 compiler.

3. Existing `cross/gmp`, `cross/mpfr`, and `cross/mpc` were built with the seed/musl toolchain. Do **not** assume these are suitable as host libraries for a glibc-hosted stage2 GCC.

4. Existing `native/binutils` is Hod-built and statically linked. It should be usable as the assembler/linker/binutils provider when building stage2.

---

## 4. Implementation Philosophy

Use the seed for `gcc-stage2` itself if necessary.

The purity boundary should initially be:

```text
seed may build gcc-stage2
gcc-stage2 builds the rest of the world
```

Do **not** try to eliminate seed usage from the stage2 recipe on the first pass. That makes the task much larger and less debuggable.

The first clean milestone is:

> `gcc-stage2` exists, runs on glibc, targets glibc, and can compile and run C programs without directly using seed tools.

After that, use `gcc-stage2` to build a bundled native toolchain and move `ncurses`/`cbonsai` to that toolchain.

---

## 5. Proposed Directory Layout

Add a new recipe area:

```text
recipes/stage2/
  gmp.ts
  gmp.json
  gmp.hod

  mpfr.ts
  mpfr.json
  mpfr.hod

  mpc.ts
  mpc.json
  mpc.hod

  gcc-stage2-c.ts
  gcc-stage2-c.json
  gcc-stage2-c.hod

  validate-gcc-stage2-c.ts
  validate-gcc-stage2-c.json
  validate-gcc-stage2-c.hod

  gcc-stage2.ts
  gcc-stage2.json
  gcc-stage2.hod

  validate-gcc-stage2.ts
  validate-gcc-stage2.json
  validate-gcc-stage2.hod
```

Use the TypeScript SDK for new recipes unless there is a strong reason not to.

The first implementation may skip the full C++ `gcc-stage2.ts` and stop at `gcc-stage2-c.ts` until C validation works.

---

## 6. Preflight Checks

Before writing the recipes, verify the following manually or with small validation recipes.

### 6.1 musl dynamic linker availability

`gcc-stage1` likely requires:

```text
/lib/ld-musl-x86_64.so.1
```

If running `/deps/gcc-stage1/bin/x86_64-linux-gnu-gcc` inside a hermetic sandbox fails with `not found`, the actual problem may be the missing ELF interpreter, not the missing file.

Possible solutions:

1. Ensure the stage2 build script creates:

   ```sh
   mkdir -p /lib
   ln -sf /deps/seed/lib/ld-musl-x86_64.so.1 /lib/ld-musl-x86_64.so.1
   ```

2. Or ensure sandbox setup auto-links dynamic linkers from dependencies.

For the first stage2 implementation, explicit symlinks in the build script are acceptable.

### 6.2 glibc dynamic linker availability

The produced stage2 compiler will be glibc-linked and will require:

```text
/lib64/ld-linux-x86-64.so.2
```

During validation recipes, ensure:

```sh
mkdir -p /lib /lib64
ln -sf /deps/glibc/lib/ld-linux-x86-64.so.2 /lib/ld-linux-x86-64.so.2
ln -sf /deps/glibc/lib/ld-linux-x86-64.so.2 /lib64/ld-linux-x86-64.so.2
```

or equivalent.

### 6.3 binutils path

Prefer Hod-built binutils:

```text
/deps/binutils/bin/as
/deps/binutils/bin/ld
/deps/binutils/bin/ar
/deps/binutils/bin/ranlib
/deps/binutils/bin/nm
/deps/binutils/bin/strip
/deps/binutils/bin/readelf
```

Avoid `-B/deps/seed/bin` in new stage2 recipes except as a temporary diagnostic fallback.

---

## 7. Common Sysroot Setup

Several recipes will need a glibc sysroot. Start by duplicating the explicit shell snippet; later this can become a helper recipe.

Use this pattern:

```sh
mkdir -p /tmp/sysroot/include /tmp/sysroot/lib /tmp/sysroot/lib64 /tmp/sysroot/usr

cp -a /deps/glibc/include/. /tmp/sysroot/include/
cp -a /deps/linux-headers/include/. /tmp/sysroot/include/
cp -a /deps/glibc/lib/. /tmp/sysroot/lib/

ln -sf ../include /tmp/sysroot/usr/include
ln -sf ../lib /tmp/sysroot/usr/lib
ln -sf ../lib64 /tmp/sysroot/usr/lib64

if [ -f /tmp/sysroot/lib/ld-linux-x86-64.so.2 ]; then
  ln -sf ../lib/ld-linux-x86-64.so.2 /tmp/sysroot/lib64/ld-linux-x86-64.so.2
fi
```

Use this sysroot when invoking `gcc-stage1`:

```sh
/deps/gcc-stage1/bin/x86_64-linux-gnu-gcc --sysroot=/tmp/sysroot -B/deps/binutils/bin
```

---

## 8. Build Stage2 GMP

Create `recipes/stage2/gmp.ts`.

Purpose: build a glibc-host static GMP library for use by `gcc-stage2`.

Dependencies:

```text
source: existing GMP source recipe or download constructor
gcc-stage1
binutils
glibc
linux-headers
seed: only for shell / dynamic linker during bootstrap
shims: if needed for make/sed/etc.
```

Configure shape:

```sh
set -e

mkdir -p /lib /lib64
ln -sf /deps/seed/lib/ld-musl-x86_64.so.1 /lib/ld-musl-x86_64.so.1 || true
ln -sf /deps/glibc/lib/ld-linux-x86-64.so.2 /lib64/ld-linux-x86-64.so.2 || true

# Build glibc sysroot
mkdir -p /tmp/sysroot/include /tmp/sysroot/lib /tmp/sysroot/lib64 /tmp/sysroot/usr
cp -a /deps/glibc/include/. /tmp/sysroot/include/
cp -a /deps/linux-headers/include/. /tmp/sysroot/include/
cp -a /deps/glibc/lib/. /tmp/sysroot/lib/
ln -sf ../include /tmp/sysroot/usr/include
ln -sf ../lib /tmp/sysroot/usr/lib
ln -sf ../lib64 /tmp/sysroot/usr/lib64
ln -sf ../lib/ld-linux-x86-64.so.2 /tmp/sysroot/lib64/ld-linux-x86-64.so.2 || true

tar xf /deps/source/source -C /tmp
cd /tmp/gmp-*

CC="/deps/gcc-stage1/bin/x86_64-linux-gnu-gcc --sysroot=/tmp/sysroot -B/deps/binutils/bin" \
AR=/deps/binutils/bin/ar \
RANLIB=/deps/binutils/bin/ranlib \
NM=/deps/binutils/bin/nm \
CFLAGS="-O2" \
./configure \
  --build=x86_64-linux-musl \
  --host=x86_64-linux-gnu \
  --prefix=/ \
  --disable-shared \
  --enable-static \
  --disable-cxx

/deps/shims/bin/make -j$(nproc)
/deps/shims/bin/make install DESTDIR=$OUT
```

Validation expectations:

```text
$OUT/include/gmp.h
$OUT/lib/libgmp.a
```

---

## 9. Build Stage2 MPFR

Create `recipes/stage2/mpfr.ts`.

Dependencies:

```text
source
gmp-stage2
gcc-stage1
binutils
glibc
linux-headers
seed
shims
```

Configure shape:

```sh
set -e

# dynamic linker symlinks and sysroot setup as above

tar xf /deps/source/source -C /tmp
cd /tmp/mpfr-*

# Existing recipe patches tests/tsprintf.c. Keep if still needed.
sed \
  -e 's/+01,234,567/+1,234,567 /' \
  -e 's/13.10Pd/13Pd/' \
  -i tests/tsprintf.c || true

CC="/deps/gcc-stage1/bin/x86_64-linux-gnu-gcc --sysroot=/tmp/sysroot -B/deps/binutils/bin" \
AR=/deps/binutils/bin/ar \
RANLIB=/deps/binutils/bin/ranlib \
NM=/deps/binutils/bin/nm \
CFLAGS="-O2" \
./configure \
  --build=x86_64-linux-musl \
  --host=x86_64-linux-gnu \
  --prefix=/ \
  --disable-shared \
  --enable-static \
  --enable-thread-safe \
  --with-gmp=/deps/gmp

/deps/shims/bin/make -j$(nproc)
/deps/shims/bin/make install DESTDIR=$OUT
```

Validation expectations:

```text
$OUT/include/mpfr.h
$OUT/lib/libmpfr.a
```

---

## 10. Build Stage2 MPC

Create `recipes/stage2/mpc.ts`.

Dependencies:

```text
source
gmp-stage2
mpfr-stage2
gcc-stage1
binutils
glibc
linux-headers
seed
shims
```

Configure shape:

```sh
set -e

# dynamic linker symlinks and sysroot setup as above

tar xf /deps/source/source -C /tmp
cd /tmp/mpc-*

CC="/deps/gcc-stage1/bin/x86_64-linux-gnu-gcc --sysroot=/tmp/sysroot -B/deps/binutils/bin" \
AR=/deps/binutils/bin/ar \
RANLIB=/deps/binutils/bin/ranlib \
NM=/deps/binutils/bin/nm \
CFLAGS="-O2" \
./configure \
  --build=x86_64-linux-musl \
  --host=x86_64-linux-gnu \
  --prefix=/ \
  --disable-shared \
  --enable-static \
  --with-gmp=/deps/gmp \
  --with-mpfr=/deps/mpfr

/deps/shims/bin/make -j$(nproc)
/deps/shims/bin/make install DESTDIR=$OUT
```

Validation expectations:

```text
$OUT/include/mpc.h
$OUT/lib/libmpc.a
```

---

## 11. Build `gcc-stage2-c` First

Do **not** start with full C++ unless necessary. Build a C-only compiler first.

Create:

```text
recipes/stage2/gcc-stage2-c.ts
```

Dependencies:

```text
source: GCC source, same as gcc-stage1-source
gcc-stage1
binutils
glibc
linux-headers
gmp-stage2
mpfr-stage2
mpc-stage2
shims
seed: acceptable for shell and musl dynamic linker during bootstrap
```

Initial configure shape:

```sh
set -e

mkdir -p /lib /lib64
ln -sf /deps/seed/lib/ld-musl-x86_64.so.1 /lib/ld-musl-x86_64.so.1 || true
ln -sf /deps/glibc/lib/ld-linux-x86-64.so.2 /lib/ld-linux-x86-64.so.2 || true
ln -sf /deps/glibc/lib/ld-linux-x86-64.so.2 /lib64/ld-linux-x86-64.so.2 || true

# Build glibc sysroot
mkdir -p /tmp/sysroot/include /tmp/sysroot/lib /tmp/sysroot/lib64 /tmp/sysroot/usr
cp -a /deps/glibc/include/. /tmp/sysroot/include/
cp -a /deps/linux-headers/include/. /tmp/sysroot/include/
cp -a /deps/glibc/lib/. /tmp/sysroot/lib/
ln -sf ../include /tmp/sysroot/usr/include
ln -sf ../lib /tmp/sysroot/usr/lib
ln -sf ../lib64 /tmp/sysroot/usr/lib64
ln -sf ../lib/ld-linux-x86-64.so.2 /tmp/sysroot/lib64/ld-linux-x86-64.so.2 || true

tar xf /deps/source/source -C /tmp
cd /tmp/gcc-*

# Keep existing stage1 patch unless proven unnecessary.
sed -e '/m64=/s/lib64/lib/' -i gcc/config/i386/t-linux64 || true

mkdir build
cd build

CC="/deps/gcc-stage1/bin/x86_64-linux-gnu-gcc --sysroot=/tmp/sysroot -B/deps/binutils/bin" \
CXX="/deps/gcc-stage1/bin/x86_64-linux-gnu-g++ --sysroot=/tmp/sysroot -B/deps/binutils/bin" \
AR=/deps/binutils/bin/ar \
RANLIB=/deps/binutils/bin/ranlib \
NM=/deps/binutils/bin/nm \
LD=/deps/binutils/bin/ld \
AS=/deps/binutils/bin/as \
STRIP=/deps/binutils/bin/strip \
OBJDUMP=/deps/binutils/bin/objdump \
OBJCOPY=/deps/binutils/bin/objcopy \
AR_FOR_TARGET=/deps/binutils/bin/ar \
RANLIB_FOR_TARGET=/deps/binutils/bin/ranlib \
NM_FOR_TARGET=/deps/binutils/bin/nm \
LD_FOR_TARGET=/deps/binutils/bin/ld \
AS_FOR_TARGET=/deps/binutils/bin/as \
STRIP_FOR_TARGET=/deps/binutils/bin/strip \
OBJDUMP_FOR_TARGET=/deps/binutils/bin/objdump \
OBJCOPY_FOR_TARGET=/deps/binutils/bin/objcopy \
../configure \
  --build=x86_64-linux-musl \
  --host=x86_64-linux-gnu \
  --target=x86_64-linux-gnu \
  --prefix=/ \
  --enable-languages=c \
  --disable-multilib \
  --disable-nls \
  --disable-bootstrap \
  --disable-fixincludes \
  --disable-libsanitizer \
  --disable-lto \
  --with-gmp=/deps/gmp \
  --with-mpfr=/deps/mpfr \
  --with-mpc=/deps/mpc \
  --with-build-sysroot=/tmp/sysroot

/deps/shims/bin/make -j$(nproc) all-gcc
/deps/shims/bin/make -j$(nproc) all-target-libgcc

cd gcc
/deps/shims/bin/make install-driver install-common install-headers-tar install-mkheaders install-gcc-ar DESTDIR=$OUT
cd ..

/deps/shims/bin/make install-target-libgcc DESTDIR=$OUT

# Convenience symlinks
mkdir -p $OUT/bin
if [ -x $OUT/bin/x86_64-linux-gnu-gcc ]; then
  ln -sf x86_64-linux-gnu-gcc $OUT/bin/gcc
  ln -sf gcc $OUT/bin/cc
fi
```

Expected output:

```text
$OUT/bin/x86_64-linux-gnu-gcc
$OUT/bin/gcc
$OUT/bin/cc
$OUT/lib/gcc/x86_64-linux-gnu/<version>/
```

---

## 12. Validate `gcc-stage2-c`

Create:

```text
recipes/stage2/validate-gcc-stage2-c.ts
```

Dependencies:

```text
gcc-stage2-c
binutils
glibc
linux-headers
possibly shims/coreutils/seed for command runner during validation
```

Validation script:

```sh
set -e

mkdir -p /lib /lib64
ln -sf /deps/glibc/lib/ld-linux-x86-64.so.2 /lib/ld-linux-x86-64.so.2 || true
ln -sf /deps/glibc/lib/ld-linux-x86-64.so.2 /lib64/ld-linux-x86-64.so.2 || true

# Build sysroot
mkdir -p /tmp/sysroot/include /tmp/sysroot/lib /tmp/sysroot/lib64 /tmp/sysroot/usr
cp -a /deps/glibc/include/. /tmp/sysroot/include/
cp -a /deps/linux-headers/include/. /tmp/sysroot/include/
cp -a /deps/glibc/lib/. /tmp/sysroot/lib/
ln -sf ../include /tmp/sysroot/usr/include
ln -sf ../lib /tmp/sysroot/usr/lib
ln -sf ../lib64 /tmp/sysroot/usr/lib64
ln -sf ../lib/ld-linux-x86-64.so.2 /tmp/sysroot/lib64/ld-linux-x86-64.so.2 || true

echo '=== gcc-stage2-c version ==='
/deps/gcc-stage2/bin/gcc --version

echo '=== compiler ELF interpreter ==='
/deps/binutils/bin/readelf -l /deps/gcc-stage2/bin/gcc | grep 'Requesting program interpreter' || true
/deps/binutils/bin/readelf -d /deps/gcc-stage2/bin/gcc | grep NEEDED || true

if /deps/binutils/bin/readelf -l /deps/gcc-stage2/bin/gcc | grep -q 'ld-musl'; then
  echo 'FAIL: gcc-stage2 is musl-linked'
  exit 1
fi

if ! /deps/binutils/bin/readelf -l /deps/gcc-stage2/bin/gcc | grep -q 'ld-linux-x86-64'; then
  echo 'FAIL: gcc-stage2 does not use glibc dynamic linker'
  exit 1
fi

mkdir -p /tmp/build
cat > /tmp/build/hello.c << 'EOF'
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void) {
  char *buf = malloc(64);
  strcpy(buf, "hello from gcc-stage2-c");
  puts(buf);
  free(buf);
  return 0;
}
EOF

/deps/gcc-stage2/bin/gcc \
  --sysroot=/tmp/sysroot \
  -B/deps/binutils/bin \
  -O2 \
  /tmp/build/hello.c \
  -o /tmp/build/hello

/tmp/build/hello

echo '=== output ELF interpreter ==='
/deps/binutils/bin/readelf -l /tmp/build/hello | grep 'Requesting program interpreter'
/deps/binutils/bin/readelf -d /tmp/build/hello | grep NEEDED

if ! /deps/binutils/bin/readelf -d /tmp/build/hello | grep -q 'libc.so.6'; then
  echo 'FAIL: output does not link against glibc libc.so.6'
  exit 1
fi

if /deps/binutils/bin/readelf -l /tmp/build/hello | grep -q 'ld-musl'; then
  echo 'FAIL: output uses musl interpreter'
  exit 1
fi

mkdir -p $OUT
cp /tmp/build/hello $OUT/hello
echo 'gcc-stage2-c validation passed' > $OUT/result.txt
```

Pass condition:

```text
- gcc-stage2 runs
- gcc-stage2 is glibc-linked
- compiled C program runs
- compiled C program is glibc-linked
- no musl interpreter in compiler or output binary
```

---

## 13. Build Full `gcc-stage2` With C++

Only after C validation passes, create:

```text
recipes/stage2/gcc-stage2.ts
```

Differences from `gcc-stage2-c`:

```sh
--enable-languages=c,c++
```

Build targets:

```sh
/deps/shims/bin/make -j$(nproc) all-gcc
/deps/shims/bin/make -j$(nproc) all-target-libgcc
/deps/shims/bin/make -j$(nproc) all-target-libstdc++-v3
```

Install targets:

```sh
cd gcc
/deps/shims/bin/make install-driver install-common install-headers-tar install-mkheaders install-gcc-ar DESTDIR=$OUT
cd ..

/deps/shims/bin/make install-target-libgcc DESTDIR=$OUT
/deps/shims/bin/make install-target-libstdc++-v3 DESTDIR=$OUT
```

Convenience symlinks:

```sh
ln -sf x86_64-linux-gnu-gcc $OUT/bin/gcc
ln -sf gcc $OUT/bin/cc

if [ -x $OUT/bin/x86_64-linux-gnu-g++ ]; then
  ln -sf x86_64-linux-gnu-g++ $OUT/bin/g++
  ln -sf g++ $OUT/bin/c++
fi
```

---

## 14. Validate Full `gcc-stage2`

Create:

```text
recipes/stage2/validate-gcc-stage2.ts
```

It should perform all C validation plus C++ validation.

C++ test:

```sh
cat > /tmp/build/hello.cc << 'EOF'
#include <iostream>
#include <vector>
#include <string>

int main() {
  std::vector<std::string> words = {"hello", "from", "gcc-stage2", "c++"};
  for (const auto &word : words) {
    std::cout << word << " ";
  }
  std::cout << std::endl;
  return 0;
}
EOF

/deps/gcc-stage2/bin/g++ \
  --sysroot=/tmp/sysroot \
  -B/deps/binutils/bin \
  -O2 \
  /tmp/build/hello.cc \
  -o /tmp/build/hello-cpp

/tmp/build/hello-cpp

/deps/binutils/bin/readelf -d /tmp/build/hello-cpp | grep NEEDED
```

Expected libraries may include:

```text
libstdc++.so.6
libgcc_s.so.1
libc.so.6
libm.so.6
```

If dynamic `libstdc++` lookup fails at runtime, either:

1. Temporarily compile C++ validation with explicit rpath:

   ```sh
   -Wl,-rpath,/deps/gcc-stage2/lib64 \
   -Wl,-rpath,/deps/gcc-stage2/lib
   ```

2. Or copy/symlink `libstdc++`/`libgcc_s` into the validation runtime layout.

Do not over-optimize this until basic stage2 C++ works.

---

## 15. Create Native Toolchain Bundle After Stage2 Works

After full `gcc-stage2` validates, create:

```text
recipes/toolchain/native-toolchain.ts
```

Purpose: provide a clean downstream build environment so packages do not depend on many individual tools.

Suggested dependencies:

```text
gcc-stage2
binutils
glibc
linux-headers
bash
coreutils
tar
native/make or shims/make
sed
grep
gawk
patch
```

Output layout:

```text
$OUT/
  bin/
    gcc
    g++
    cc
    c++
    ar
    ranlib
    ld
    as
    strip
    readelf
    objcopy
    objdump
    sh
    bash
    make
    tar
    cp
    mkdir
    chmod
    ln
    sed
    grep
    awk
    patch

  sysroot/
    include/
    lib/
    lib64/

  lib/gcc/...
  include/...
```

Important: preserve GCC's relative layout. Do not copy only `gcc`/`g++` binaries without their adjacent `lib/gcc/...` directories.

Recommended bundle strategy:

1. Copy all of `gcc-stage2` into `$OUT` first.
2. Overlay/copy binutils binaries into `$OUT/bin`.
3. Overlay/copy shell/coreutils/make/tar/sed/grep/etc. into `$OUT/bin`.
4. Build `$OUT/sysroot` from glibc + linux-headers.
5. Add convenience symlinks.

Example:

```sh
set -e

mkdir -p $OUT
cp -a /deps/gcc-stage2/. $OUT/

mkdir -p $OUT/bin
cp -a /deps/binutils/bin/* $OUT/bin/
cp -a /deps/bash/bin/bash $OUT/bin/bash
ln -sf bash $OUT/bin/sh
cp -a /deps/make/bin/make $OUT/bin/make
cp -a /deps/coreutils/bin/* $OUT/bin/ 2>/dev/null || true
cp -a /deps/tar/bin/* $OUT/bin/ 2>/dev/null || true
cp -a /deps/sed/bin/* $OUT/bin/ 2>/dev/null || true
cp -a /deps/grep/bin/* $OUT/bin/ 2>/dev/null || true
cp -a /deps/gawk/bin/gawk $OUT/bin/gawk 2>/dev/null || true
ln -sf gawk $OUT/bin/awk
cp -a /deps/patch/bin/* $OUT/bin/ 2>/dev/null || true

ln -sf x86_64-linux-gnu-gcc $OUT/bin/gcc
ln -sf gcc $OUT/bin/cc
ln -sf x86_64-linux-gnu-g++ $OUT/bin/g++ 2>/dev/null || true
ln -sf g++ $OUT/bin/c++ 2>/dev/null || true

mkdir -p $OUT/sysroot/include $OUT/sysroot/lib $OUT/sysroot/lib64 $OUT/sysroot/usr
cp -a /deps/glibc/include/. $OUT/sysroot/include/
cp -a /deps/linux-headers/include/. $OUT/sysroot/include/
cp -a /deps/glibc/lib/. $OUT/sysroot/lib/
ln -sf ../include $OUT/sysroot/usr/include
ln -sf ../lib $OUT/sysroot/usr/lib
ln -sf ../lib64 $OUT/sysroot/usr/lib64
ln -sf ../lib/ld-linux-x86-64.so.2 $OUT/sysroot/lib64/ld-linux-x86-64.so.2 || true

chmod +x $OUT/bin/* 2>/dev/null || true
```

Downstream usage:

```sh
export PATH=/deps/toolchain/bin
export CC="/deps/toolchain/bin/gcc --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"
export CXX="/deps/toolchain/bin/g++ --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"
export AR=/deps/toolchain/bin/ar
export RANLIB=/deps/toolchain/bin/ranlib
export STRIP=/deps/toolchain/bin/strip
```

---

## 16. Move `ncurses` to Native Toolchain

Only after validating `native-toolchain`, update `recipes/native/ncurses/ncurses.ts`.

Current shape:

```ts
command: "/deps/seed/bin/busybox",
args: ["sh", "-c", script],
env: { PATH: "/deps/seed/bin:/deps/make/bin" },
dependencies: [
  dep("make", make),
  dep("seed", seed),
  dep("source", source),
]
```

Target shape:

```ts
command: "/deps/toolchain/bin/sh",
args: ["-c", script],
env: { PATH: "/deps/toolchain/bin" },
dependencies: [
  dep("toolchain", nativeToolchain),
  dep("source", source),
]
```

Inside script:

```sh
export PATH=/deps/toolchain/bin
export CC="/deps/toolchain/bin/gcc --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"
export AR=/deps/toolchain/bin/ar
export RANLIB=/deps/toolchain/bin/ranlib
export STRIP=/deps/toolchain/bin/strip

./configure \
  --prefix=/ \
  --disable-shared \
  --enable-static \
  --enable-widec \
  --without-debug \
  --without-ada \
  --without-manpages \
  --without-tests \
  --without-cxx-binding \
  --disable-stripping

make -j$(nproc)
make install DESTDIR=$OUT
```

Do not include `seed` as a direct dependency.

---

## 17. Move `cbonsai` to Native Toolchain

After native-toolchain ncurses works, update `recipes/native/cbonsai/cbonsai.ts`.

Target shape:

```ts
command: "/deps/toolchain/bin/sh",
args: ["-c", script],
env: { PATH: "/deps/toolchain/bin" },
dependencies: [
  dep("toolchain", nativeToolchain),
  dep("ncurses", ncursesRecipe),
  dep("source", source),
]
```

Inside script:

```sh
export PATH=/deps/toolchain/bin
export CC="/deps/toolchain/bin/gcc --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"

make cbonsai \
  CFLAGS="-O2 -I/deps/ncurses/include -I/deps/ncurses/include/ncursesw" \
  LDFLAGS="-static -L/deps/ncurses/lib" \
  LDLIBS="-lpanelw -lncursesw"
```

Again, no direct `seed` dependency.

---

## 18. Debugging Guide

### Symptom: `sh: /deps/gcc-stage1/bin/x86_64-linux-gnu-gcc: not found`

Likely cause: missing musl dynamic linker, not missing compiler file.

Check:

```sh
/deps/binutils/bin/readelf -l /deps/gcc-stage1/bin/x86_64-linux-gnu-gcc | grep interpreter
```

If it says `ld-musl-x86_64.so.1`, ensure:

```sh
/lib/ld-musl-x86_64.so.1
```

exists inside sandbox.

### Symptom: `gcc-stage2/bin/gcc: not found`

Likely cause: missing glibc dynamic linker.

Check:

```sh
/deps/binutils/bin/readelf -l /deps/gcc-stage2/bin/gcc | grep interpreter
```

Ensure:

```sh
/lib64/ld-linux-x86-64.so.2
```

exists inside sandbox.

### Symptom: configure cannot run C compiled programs

If building a `--host=x86_64-linux-gnu` package from the musl bootstrap environment, configure may treat this as cross-compilation and skip runtime checks. If it tries to run produced glibc binaries, ensure the glibc dynamic linker is present.

For configure-heavy packages, cache variables may be needed.

### Symptom: GCC cannot find `cc1`

Likely GCC relative layout is broken.

Check that the binary path and lib path preserve this relationship:

```text
bin/gcc
lib/gcc/x86_64-linux-gnu/<version>/cc1
```

Do not move only the GCC executable into another directory without its lib tree.

### Symptom: GCC cannot find headers

Pass explicit sysroot:

```sh
--sysroot=/tmp/sysroot
```

or, for the bundled toolchain:

```sh
--sysroot=/deps/toolchain/sysroot
```

Check:

```text
sysroot/include/stdio.h
sysroot/include/linux/*.h
sysroot/lib/libc.so
```

### Symptom: linker cannot find `crt1.o`, `crti.o`, `crtn.o`

These come from glibc and must exist in the sysroot lib directory.

Check:

```sh
find /tmp/sysroot -name 'crt*.o'
```

If GCC does not find them, inspect linker search path:

```sh
/deps/gcc-stage2/bin/gcc --sysroot=/tmp/sysroot -B/deps/binutils/bin -v hello.c -o hello
```

---

## 19. Success Criteria

The stage2 project is successful when all of the following are true.

### `gcc-stage2-c`

- Builds successfully.
- `/deps/gcc-stage2/bin/gcc --version` runs in sandbox.
- `readelf -l gcc` shows glibc interpreter, not musl.
- Can compile and run a C hello world.
- The produced C binary links against glibc.

### Full `gcc-stage2`

- Builds C and C++ frontend.
- `/deps/gcc-stage2/bin/g++ --version` runs.
- Can compile and run a C++ hello world.
- `libstdc++` and `libgcc_s` are usable.

### Native toolchain

- Provides a single dependency with shell, compiler, binutils, make, and common Unix tools.
- Can compile C and C++ using:

  ```sh
  PATH=/deps/toolchain/bin
  CC="/deps/toolchain/bin/gcc --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"
  ```

### ncurses/cbonsai

- `ncurses.ts` has no direct seed dependency.
- `cbonsai.ts` has no direct seed dependency.
- Both build with `native-toolchain`.
- Build scripts do not reference `/deps/seed`.

---

## 20. Suggested Commit Sequence

Do this as small commits/checkpoints.

1. Add this plan document.
2. Add stage2 GMP recipe.
3. Add stage2 MPFR recipe.
4. Add stage2 MPC recipe.
5. Add `gcc-stage2-c` recipe.
6. Add `validate-gcc-stage2-c` recipe.
7. Fix any sandbox dynamic linker issues discovered.
8. Add full `gcc-stage2` recipe with C++.
9. Add `validate-gcc-stage2` recipe.
10. Add `native-toolchain` bundle.
11. Move `ncurses` to native-toolchain.
12. Move `cbonsai` to native-toolchain.
13. Optionally add `stage3` compiler rebuild using `gcc-stage2` itself.

---

## 21. Non-Goals For First Implementation

Do not attempt these until stage2 is working:

- No stage3 reproducibility comparison.
- No perfect wrapper system for `gcc`/`g++`.
- No RPATH patching of the compiler itself unless needed.
- No removal of seed from the stage2 build recipe.
- No global recipe graph rewrite.
- No package manager abstraction.
- No custom sysroot recipe unless duplication becomes painful.

Keep the first implementation focused on producing and validating a glibc-hosted GCC.

---

## 22. Final Mental Model

The correct state after this work should look like:

```text
seed
  └── stage1 bootstrap tools
        └── gcc-stage2
              └── native-toolchain
                    ├── ncurses
                    └── cbonsai
```

`ncurses` and `cbonsai` will still have the seed in their transitive historical closure, because the native toolchain was bootstrapped from it. That is fine.

The important property is:

> Normal packages no longer directly execute or mount the bootstrap seed tools.

That is the principled bootstrap boundary.
