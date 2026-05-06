//! Hod-built musl toolchain assembly.
//!
//! Combines the Hod-built gcc-musl and binutils-musl into a single output
//! that matches the musl.cc toolchain layout (x86_64-linux-musl-native/).
//! This replaces the pre-built musl.cc download, making the bootstrap
//! pipeline fully auditable from source.
//!
//! Layout produced:
//!   x86_64-linux-musl-native/
//!     bin/          — gcc + binutils (prefixed and unprefixed)
//!     include/      — musl C headers + GCC C++ headers
//!     lib/          — musl libc, crt*.o, libgcc, libstdc++, libbfd, etc.
//!     lib/gcc/      — GCC internal libs (crt*.o, libgcc.a, etc.)
//!     libexec/gcc/  — cc1, cc1plus, collect2
//!     x86_64-linux-musl/  — binutils symlinks, lib/ldscripts
//!     share/        — GCC python scripts
//!
//! This is a pure assembly recipe — no compilation, just file layout.
import { process, dep, importToStore } from "../../js/src/index.js";
import { seedRootRecipe } from "./seed-root.js";
import { gccMuslRecipe } from "./gcc-musl.js";
import { binutilsMuslRecipe } from "./binutils-musl.js";

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

ROOT=$OUT/x86_64-linux-musl-native
mkdir -p $ROOT/bin $ROOT/lib $ROOT/include

# --- GCC files (includes musl headers/libs merged during gcc build) ---
cp -a /deps/gcc/bin/* $ROOT/bin/
cp -a /deps/gcc/include/* $ROOT/include/ 2>/dev/null || true
cp -a /deps/gcc/lib/* $ROOT/lib/ 2>/dev/null || true

# GCC internal directories (lib/gcc/, libexec/gcc/)
if [ -d /deps/gcc/lib/gcc ]; then
  mkdir -p $ROOT/lib/gcc
  cp -a /deps/gcc/lib/gcc/* $ROOT/lib/gcc/
fi
if [ -d /deps/gcc/libexec ]; then
  cp -a /deps/gcc/libexec $ROOT/
fi

# GCC share directory (python scripts for gdb pretty-printers)
if [ -d /deps/gcc/share ]; then
  cp -a /deps/gcc/share $ROOT/
fi

# --- Binutils files ---
# Copy prefixed tools (x86_64-linux-musl-*) that aren't already present
# from gcc (gcc also provides x86_64-linux-musl-gcc etc.)
for tool in /deps/binutils/bin/x86_64-linux-musl-*; do
  name=$(basename $tool)
  if [ ! -e "$ROOT/bin/$name" ]; then
    cp -a "$tool" "$ROOT/bin/$name"
  fi
done

# Copy unprefixed binutils tools that gcc doesn't provide
# (ar, as, ld, nm, objcopy, objdump, ranlib, readelf, strip, etc.)
for tool in ar as ld ld.bfd ld.gold nm objcopy objdump ranlib readelf strip \\
            addr2line c++filt elfedit gprof size strings; do
  if [ -x "/deps/binutils/bin/$tool" ] && [ ! -e "$ROOT/bin/$tool" ]; then
    cp -a "/deps/binutils/bin/$tool" "$ROOT/bin/$tool"
  fi
done

# Binutils target directories (x86_64-linux-musl/bin, x86_64-linux-musl/lib)
if [ -d /deps/binutils/x86_64-linux-musl ]; then
  # Merge binutils x86_64-linux-musl/ into our existing one (from gcc's musl sysroot)
  if [ -d $ROOT/x86_64-linux-musl ]; then
    # Already exists from gcc (musl sysroot); merge binutils on top
    cp -a /deps/binutils/x86_64-linux-musl/* $ROOT/x86_64-linux-musl/ 2>/dev/null || true
  else
    cp -a /deps/binutils/x86_64-linux-musl $ROOT/
  fi
fi

# Binutils libraries (libbfd, libopcodes, libctf — needed by some tools)
for lib in /deps/binutils/lib/libbfd* /deps/binutils/lib/libopcodes* /deps/binutils/lib/libctf*; do
  if [ -f "$lib" ]; then
    cp -a "$lib" "$ROOT/lib/"
  fi
done

# Binutils bfd-plugins
if [ -d /deps/binutils/lib/bfd-plugins ]; then
  mkdir -p $ROOT/lib/bfd-plugins
  cp -a /deps/binutils/lib/bfd-plugins/* $ROOT/lib/bfd-plugins/ 2>/dev/null || true
fi

# --- Verification ---
echo "=== hod-musl-toolchain verification ==="

# GCC tools
ls -la $ROOT/bin/gcc || { echo "ERROR: gcc missing"; exit 1; }
ls -la $ROOT/bin/g++ || { echo "ERROR: g++ missing"; exit 1; }
ls -la $ROOT/bin/x86_64-linux-musl-gcc || { echo "ERROR: prefixed gcc missing"; exit 1; }

# Binutils tools
ls -la $ROOT/bin/ar || { echo "ERROR: ar missing"; exit 1; }
ls -la $ROOT/bin/as || { echo "ERROR: as missing"; exit 1; }
ls -la $ROOT/bin/ld || { echo "ERROR: ld missing"; exit 1; }
ls -la $ROOT/bin/objcopy || { echo "ERROR: objcopy missing"; exit 1; }
ls -la $ROOT/bin/strip || { echo "ERROR: strip missing"; exit 1; }
ls -la $ROOT/bin/readelf || { echo "ERROR: readelf missing"; exit 1; }

# Prefixed binutils
ls -la $ROOT/bin/x86_64-linux-musl-as || { echo "ERROR: prefixed as missing"; exit 1; }
ls -la $ROOT/bin/x86_64-linux-musl-ld || { echo "ERROR: prefixed ld missing"; exit 1; }

# Internal GCC components
ls -la $ROOT/libexec/gcc/x86_64-linux-musl/*/cc1 || { echo "ERROR: cc1 missing"; exit 1; }
ls -la $ROOT/libexec/gcc/x86_64-linux-musl/*/cc1plus || { echo "ERROR: cc1plus missing"; exit 1; }
ls -la $ROOT/lib/gcc/x86_64-linux-musl/*/libgcc.a || { echo "ERROR: libgcc.a missing"; exit 1; }

# Musl C library
ls -la $ROOT/lib/libc.so || { echo "ERROR: libc.so missing"; exit 1; }
ls -la $ROOT/lib/ld-musl-x86_64.so.1 || { echo "ERROR: ld-musl missing"; exit 1; }
ls -la $ROOT/lib/crt1.o || { echo "ERROR: crt1.o missing"; exit 1; }

# Headers
ls -la $ROOT/include/stdio.h || { echo "ERROR: stdio.h missing"; exit 1; }
ls -la $ROOT/include/wchar.h || { echo "ERROR: wchar.h missing"; exit 1; }
ls $ROOT/include/c++/14.2.0/iostream || { echo "ERROR: C++ iostream header missing"; exit 1; }

# C++ runtime
ls -la $ROOT/lib/libstdc++.so.6 || { echo "ERROR: libstdc++.so.6 missing"; exit 1; }

echo "=== All toolchain components present ==="`,
  ],
  dependencies: [
    dep("binutils", binutilsMuslRecipe),
    dep("gcc", gccMuslRecipe),
    dep("seed", seedRootRecipe),
  ],
});

await importToStore(recipe);
export const hodMuslToolchainRecipe = recipe;
