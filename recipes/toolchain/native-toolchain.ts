//! native-toolchain — a bundled toolchain for downstream packages.
//!
//! Provides a single dependency with:
//!   - gcc-stage2 (C/C++ compiler, glibc-linked)
//!   - binutils (as, ld, ar, ranlib, strip, etc.)
//!   - glibc + linux-headers as a sysroot
//!   - bindgen/clang metadata under share/hod/cc/
//!   - bash, coreutils, make, tar, sed, grep, gawk, patch
//!   - pkgconf (pkg-config replacement for dependency discovery)
//!   - busybox (statically linked, musl-built, replaces seed's busybox)
//!
//! Downstream packages depend on this instead of individual tools.
//! No direct seed dependency needed.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { hodSeedRootRecipe } from "../bootstrap/hod-seed-root.js";
import { gccStage2Recipe } from "../stage2/gcc-stage2.js";
import { binutilsRecipe } from "../native/binutils.js";
import { glibcRecipe } from "../cross/glibc.js";
import { linuxHeadersRecipe } from "../cross/linux-headers.js";
import { bashRecipe } from "../native/bash.js";
import { coreutilsRecipe } from "../native/coreutils.js";
import { tarRecipe } from "../native/tar.js";
import { sedRecipe } from "../native/sed.js";
import { grepRecipe } from "../native/grep.js";
import { gawkRecipe } from "../native/gawk.js";
import { patchRecipe } from "../native/patch.js";
import { makeRecipe } from "../native/make.js";
import { busyboxNativeRecipe } from "./busybox-native.js";
import { pkgconfRecipe } from "../native/pkgconf/pkgconf.js";

const preamble = hermeticPreamble({
  shell: "seed",
  muslLinker: "seed",
  glibcLinker: "glibc",
});

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

${preamble}

# === Assemble the toolchain ===

# Start with gcc-stage2 (preserves GCC's internal layout: bin/, lib/gcc/...)
mkdir -p $OUT
cp -a /deps/gcc-stage2/. $OUT/

# Overlay binutils into bin/
mkdir -p $OUT/bin
cp -a /deps/binutils/bin/* $OUT/bin/

# Overlay shell and core utilities
cp -a /deps/bash/bin/bash $OUT/bin/bash
ln -sf bash $OUT/bin/sh

cp -a /deps/make/bin/make $OUT/bin/make 2>/dev/null || true
cp -a /deps/coreutils/bin/* $OUT/bin/ 2>/dev/null || true
cp -a /deps/tar/bin/* $OUT/bin/ 2>/dev/null || true
cp -a /deps/sed/bin/* $OUT/bin/ 2>/dev/null || true
cp -a /deps/grep/bin/* $OUT/bin/ 2>/dev/null || true
cp -a /deps/gawk/bin/gawk $OUT/bin/gawk 2>/dev/null || true
ln -sf gawk $OUT/bin/awk 2>/dev/null || true
cp -a /deps/patch/bin/* $OUT/bin/ 2>/dev/null || true

# Overlay pkgconf (pkg-config replacement)
cp -a /deps/pkgconf/bin/pkgconf $OUT/bin/pkgconf
ln -sf pkgconf $OUT/bin/pkg-config
ln -sf pkgconf $OUT/bin/bomtool 2>/dev/null || true

# Overlay native busybox (statically linked, replaces seed's busybox)
# This provides a shell executor with no dynamic linker dependency.
cp -a /deps/busybox-native/bin/busybox $OUT/bin/busybox

# Add busybox applet symlinks for tools the GNU packages above do not provide
# (e.g. gzip/bzip2/xz helpers used by tar extraction). Do not overwrite the
# GNU/coreutils variants we already copied into the bundle.
for applet in $(/deps/busybox-native/bin/busybox --list); do
  [ "$applet" = "busybox" ] && continue
  [ -e "$OUT/bin/$applet" ] && continue
  ln -sf busybox "$OUT/bin/$applet" 2>/dev/null || true
done

# Convenience symlinks for compiler
ln -sf x86_64-linux-gnu-gcc $OUT/bin/gcc 2>/dev/null || true
ln -sf gcc $OUT/bin/cc 2>/dev/null || true
ln -sf x86_64-linux-gnu-g++ $OUT/bin/g++ 2>/dev/null || true
ln -sf g++ $OUT/bin/c++ 2>/dev/null || true

# === Build the sysroot ===
mkdir -p $OUT/sysroot/include $OUT/sysroot/lib $OUT/sysroot/lib64 $OUT/sysroot/usr
cp -a /deps/glibc/include/. $OUT/sysroot/include/
cp -a /deps/linux-headers/include/. $OUT/sysroot/include/
cp -a /deps/glibc/lib/. $OUT/sysroot/lib/
ln -sf ../include $OUT/sysroot/usr/include
ln -sf ../lib $OUT/sysroot/usr/lib
ln -sf ../lib64 $OUT/sysroot/usr/lib64
ln -sf ../lib/ld-linux-x86-64.so.2 $OUT/sysroot/lib64/ld-linux-x86-64.so.2 2>/dev/null || true

# === Make the glibc runtime available at the top-level lib/ ===
# This allows downstream recipes to use glibcLinker: "toolchain" in the
# preamble. We symlink .so*, crt*.o, and static libs from the sysroot.
# (gcc's own lib/ already exists with libgcc_s, libstdc++; we add glibc on top.)
for lib in $OUT/sysroot/lib/*.so*; do
  ln -sf "../sysroot/lib/$(basename "$lib")" "$OUT/lib/$(basename "$lib")" 2>/dev/null || true
done
for obj in $OUT/sysroot/lib/crt*.o $OUT/sysroot/lib/*.a; do
  ln -sf "../sysroot/lib/$(basename "$obj")" "$OUT/lib/$(basename "$obj")" 2>/dev/null || true
done
# Symlink gconv and audit subdirs
ln -sf ../sysroot/lib/gconv $OUT/lib/gconv 2>/dev/null || true
ln -sf ../sysroot/lib/audit $OUT/lib/audit 2>/dev/null || true

# Ensure everything is executable
chmod +x $OUT/bin/* 2>/dev/null || true

# === pkgconf integration into sysroot ===
# Install pkgconf's own .pc file and pkg.m4 into the sysroot so that
# autotools-based builds can discover pkg-config automatically.
mkdir -p $OUT/sysroot/lib/pkgconfig
cp -a /deps/pkgconf/lib/pkgconfig/libpkgconf.pc $OUT/sysroot/lib/pkgconfig/ 2>/dev/null || true
mkdir -p $OUT/sysroot/share/aclocal
cp -a /deps/pkgconf/share/aclocal/pkg.m4 $OUT/sysroot/share/aclocal/ 2>/dev/null || true
mkdir -p $OUT/sysroot/include/pkgconf/libpkgconf
cp -a /deps/pkgconf/include/pkgconf/libpkgconf/* $OUT/sysroot/include/pkgconf/libpkgconf/ 2>/dev/null || true
cp -a /deps/pkgconf/lib/libpkgconf.a $OUT/sysroot/lib/ 2>/dev/null || true

# === Bindgen / clang metadata ===
# Emit sandbox-relative include flags for libclang/bindgen. These files are the
# Hod equivalent of nixpkgs' compiler-wrapper metadata: consumers read them at
# build time to construct BINDGEN_EXTRA_CLANG_ARGS without touching the host.
mkdir -p $OUT/share/hod/cc

GCC_VER=""
for d in $OUT/lib/gcc/x86_64-linux-gnu/*; do
  [ -d "$d" ] || continue
  GCC_VER="\${d##*/}"
  break
done
[ -n "$GCC_VER" ] || { echo "ERROR: failed to detect GCC version dir"; exit 1; }

CXX_VER=""
for d in $OUT/include/c++/*; do
  [ -d "$d" ] || continue
  CXX_VER="\${d##*/}"
  break
done
[ -n "$CXX_VER" ] || { echo "ERROR: failed to detect libstdc++ include dir"; exit 1; }

CC_CFLAGS="--sysroot=/deps/toolchain/sysroot -nostdinc -isystem /deps/toolchain/lib/gcc/x86_64-linux-gnu/$GCC_VER/include"
[ -d "$OUT/lib/gcc/x86_64-linux-gnu/$GCC_VER/include-fixed" ] && \
  CC_CFLAGS="$CC_CFLAGS -isystem /deps/toolchain/lib/gcc/x86_64-linux-gnu/$GCC_VER/include-fixed"
printf '%s\n' "$CC_CFLAGS" > $OUT/share/hod/cc/cc-cflags

LIBC_CFLAGS="-isystem /deps/toolchain/sysroot/include"
printf '%s\n' "$LIBC_CFLAGS" > $OUT/share/hod/cc/libc-cflags

LIBCXX_CXXFLAGS="-nostdinc++ -isystem /deps/toolchain/include/c++/$CXX_VER"
[ -d "$OUT/include/c++/$CXX_VER/x86_64-linux-gnu" ] && \
  LIBCXX_CXXFLAGS="$LIBCXX_CXXFLAGS -isystem /deps/toolchain/include/c++/$CXX_VER/x86_64-linux-gnu"
[ -d "$OUT/include/c++/$CXX_VER/backward" ] && \
  LIBCXX_CXXFLAGS="$LIBCXX_CXXFLAGS -isystem /deps/toolchain/include/c++/$CXX_VER/backward"
printf '%s\n' "$LIBCXX_CXXFLAGS" > $OUT/share/hod/cc/libcxx-cxxflags

# === Verification ===
echo "=== Toolchain contents ==="
ls $OUT/bin/ | head -30
echo "..."
echo "=== Sysroot ==="
ls $OUT/sysroot/lib/libc.so* $OUT/sysroot/lib/crt*.o 2>&1
echo "=== GCC internal ==="
ls $OUT/lib/gcc/x86_64-linux-gnu/13.2.0/cc1 2>&1 || echo "cc1 not found (may need to check install)"
echo "=== Bindgen metadata ==="
echo "cc-cflags: $(/deps/seed/bin/busybox cat $OUT/share/hod/cc/cc-cflags)"
echo "libc-cflags: $(/deps/seed/bin/busybox cat $OUT/share/hod/cc/libc-cflags)"
echo "libcxx-cxxflags: $(/deps/seed/bin/busybox cat $OUT/share/hod/cc/libcxx-cxxflags)"
echo "=== Toolchain bundle complete ==="`,
  ],
  env: [
    { key: "C_INCLUDE_PATH", value: "" },
  ],
  dependencies: [
    dep("bash", bashRecipe),
    dep("binutils", binutilsRecipe),
    dep("busybox-native", busyboxNativeRecipe),
    dep("coreutils", coreutilsRecipe),
    dep("gcc-stage2", gccStage2Recipe),
    dep("gawk", gawkRecipe),
    dep("glibc", glibcRecipe),
    dep("grep", grepRecipe),
    dep("linux-headers", linuxHeadersRecipe),
    dep("make", makeRecipe),
    dep("patch", patchRecipe),
    dep("pkgconf", pkgconfRecipe),
    dep("sed", sedRecipe),
    dep("seed", hodSeedRootRecipe),
    dep("tar", tarRecipe),
  ],
});

await importToStore(recipe);
export const nativeToolchainRecipe = recipe;
