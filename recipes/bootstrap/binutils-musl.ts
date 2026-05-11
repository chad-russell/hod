//! binutils musl build from source.
//!
//! Builds GNU binutils 2.44 targeting x86_64-linux-musl using the seed's
//! musl gcc. This produces the assembler, linker, archiver, and other
//! binary utilities needed for a complete musl toolchain.
//!
//! Output layout matches the musl.cc toolchain structure:
//!   bin/{ar,as,ld,ld.bfd,nm,objcopy,objdump,ranlib,readelf,strip,...}
//!   x86_64-linux-musl/bin/{ar,as,ld,ld.bfd,nm,...}
//!   x86_64-linux-musl/lib/ldscripts/
//!
//! Key bootstrap detail: we build as a native x86_64-linux-musl toolchain
//! (build=host=target=x86_64-linux-musl), but use the seed's gcc as the
//! bootstrap compiler. The --disable-werror flag is needed because
//! binutils may have warnings that are errors with newer host compilers.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { seedRootRecipe } from "./seed-root.js";
import { binutilsSourceRecipe } from "./binutils-source.js";
import { makeRecipe as shimMakeRecipe } from "../shims/make.js";

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

export PATH=/tmp/gcc-wrapper:/deps/make/bin:/deps/seed/bin
MAKE=/deps/make/bin/make

# The seed musl gcc has hardcoded paths from the host staging directory.
# In the sandbox those don't exist. We create a wrapper that uses
# -B to tell gcc where to find cc1, collect2, crt*.o, libgcc.a, etc.
#
# NOTE: No -I or -L flags! The seed's include/ has headers from its
# pre-built binutils (2.37), glibc, etc. that conflict with the
# headers from the source we're building (2.44). The -B flags are
# sufficient for GCC to find its subprograms and runtime objects.
mkdir -p /tmp/gcc-wrapper
cat > /tmp/gcc-wrapper/gcc << 'WRAPPER'
#!/bin/sh
exec /deps/seed/bin/gcc \\
  -B/deps/seed/libexec/gcc/x86_64-linux-musl/11.2.1/ \\
  -B/deps/seed/lib/gcc/x86_64-linux-musl/11.2.1/ \\
  -B/deps/seed/x86_64-linux-musl/lib/ \\
  "$@"
WRAPPER
chmod +x /tmp/gcc-wrapper/gcc

# Verify the wrapper works
/tmp/gcc-wrapper/gcc --version | head -1

# Extract binutils source
tar xf /deps/source/source -C /tmp

# Build in a separate directory (recommended for binutils)
mkdir -p /tmp/binutils-build
cd /tmp/binutils-build

# Configure binutils as a native x86_64-linux-musl toolchain.
# --prefix=/ so DESTDIR install puts everything under $OUT.
# --disable-werror to avoid build failures from warnings.
# --disable-nls to avoid locale/translation dependencies.
# --enable-gold=yes to build the gold linker (present in musl.cc).
#
# config.cache: libiberty's autoconf header checks fail in our sandboxed
# environment (the seed gcc's include paths aren't fully detected by
# configure's preprocessor tests). We pre-seed the answers for headers
# that we know exist in the seed toolchain.
CC=/tmp/gcc-wrapper/gcc \\
AR=/deps/seed/bin/ar \\
RANLIB=/deps/seed/bin/ranlib \\
/tmp/binutils-2.44/configure \\
  --target=x86_64-linux-musl \\
  --prefix=/ \\
  --disable-werror \\
  --disable-nls \\
  --enable-gold=yes \\
  --enable-ld=yes \\
  --disable-separate-code \\
  --enable-deterministic-archives

$MAKE -j$(nproc)
$MAKE install DESTDIR=$OUT

# Verify key outputs exist
echo "=== Binutils build output verification ==="
ls -la $OUT/bin/x86_64-linux-musl-as || { echo "ERROR: as missing"; exit 1; }
ls -la $OUT/bin/x86_64-linux-musl-ld || { echo "ERROR: ld missing"; exit 1; }
ls -la $OUT/bin/x86_64-linux-musl-ar || { echo "ERROR: ar missing"; exit 1; }
ls -la $OUT/bin/x86_64-linux-musl-ranlib || { echo "ERROR: ranlib missing"; exit 1; }
ls -la $OUT/bin/x86_64-linux-musl-objcopy || { echo "ERROR: objcopy missing"; exit 1; }
ls -la $OUT/bin/x86_64-linux-musl-readelf || { echo "ERROR: readelf missing"; exit 1; }
ls -la $OUT/bin/x86_64-linux-musl-strip || { echo "ERROR: strip missing"; exit 1; }
ls -la $OUT/bin/x86_64-linux-musl-nm || { echo "ERROR: nm missing"; exit 1; }
ls -la $OUT/bin/x86_64-linux-musl-objdump || { echo "ERROR: objdump missing"; exit 1; }

# Also create unprefixed symlinks in bin/ (matching musl.cc layout)
# The musl.cc tarball has both prefixed and unprefixed names
for tool in ar as ld nm objcopy objdump ranlib readelf strip addr2line c++filt elfedit size strings gprof; do
  if [ -x "$OUT/bin/x86_64-linux-musl-$tool" ] && [ ! -e "$OUT/bin/$tool" ]; then
    ln -sf "x86_64-linux-musl-$tool" "$OUT/bin/$tool"
  fi
done

# Create ld.bfd symlinks (both prefixed and unprefixed, matching musl.cc layout)
# glibc's configure checks for ld.bfd specifically
if [ -x "$OUT/bin/x86_64-linux-musl-ld.bfd" ]; then
  echo "ld.bfd present"
else
  # ld.bfd is usually ld itself — create symlink
  ln -sf x86_64-linux-musl-ld "$OUT/bin/x86_64-linux-musl-ld.bfd"
fi
# Unprefixed ld.bfd (needed by glibc configure)
if [ ! -e "$OUT/bin/ld.bfd" ]; then
  ln -sf x86_64-linux-musl-ld "$OUT/bin/ld.bfd"
fi
# Unprefixed ld.gold if the gold linker was built
if [ -x "$OUT/bin/x86_64-linux-musl-ld.gold" ] && [ ! -e "$OUT/bin/ld.gold" ]; then
  ln -sf x86_64-linux-musl-ld.gold "$OUT/bin/ld.gold"
fi

# Verify ldscripts exist
ls $OUT/x86_64-linux-musl/lib/ldscripts/ | head -5
echo "=== All key binutils outputs present ==="`,
  ],
  dependencies: [
    dep("make", shimMakeRecipe),
    dep("seed", seedRootRecipe),
    dep("source", binutilsSourceRecipe),
  ],
});

await importToStore(recipe);
export const binutilsMuslRecipe = recipe;
