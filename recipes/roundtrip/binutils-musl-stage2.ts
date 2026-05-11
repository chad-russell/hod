//! Round-trip binutils-musl build — rebuilds binutils 2.37 targeting musl
//! using the native glibc toolchain.
//!
//! This is Phase C.2: proving the native-toolchain can build binutils
//! targeting musl. The native gcc (glibc-linked) produces a musl-targeting
//! assembler, linker, etc.
//!
//! This is a cross-compilation: host=glibc, target=musl. Binutils supports
//! this natively via --target=x86_64-linux-musl.
import { shellBuild, dep, importToStore } from "../../js/src/index.js";
import { nativeToolchainRecipe } from "../toolchain/native-toolchain.js";
import { binutilsSourceRecipe } from "../bootstrap/binutils-source.js";
import { cProfile } from "../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile(),
  script: `
export PATH=/deps/toolchain/bin:$PATH

tar xf /deps/source/source -C /tmp

# Build in a separate directory (recommended for binutils)
mkdir -p /tmp/binutils-build
cd /tmp/binutils-build

# Configure binutils targeting x86_64-linux-musl.
# The host compiler is the native glibc gcc; the output targets musl.
CC="/deps/toolchain/bin/gcc --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin" \\
CXX="/deps/toolchain/bin/g++ --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin" \\
AR=ar \\
RANLIB=ranlib \\
/tmp/binutils-2.37/configure \\
  --target=x86_64-linux-musl \\
  --prefix=/ \\
  --disable-werror \\
  --disable-nls \\
  --enable-gold=yes \\
  --enable-ld=yes \\
  --disable-separate-code \\
  --enable-deterministic-archives

make -j$(nproc)
make install DESTDIR=$OUT

# Verify key outputs
echo "=== Round-trip binutils build output verification ==="
ls -la $OUT/bin/x86_64-linux-musl-as || { echo "ERROR: as missing"; exit 1; }
ls -la $OUT/bin/x86_64-linux-musl-ld || { echo "ERROR: ld missing"; exit 1; }
ls -la $OUT/bin/x86_64-linux-musl-ar || { echo "ERROR: ar missing"; exit 1; }
ls -la $OUT/bin/x86_64-linux-musl-ranlib || { echo "ERROR: ranlib missing"; exit 1; }
ls -la $OUT/bin/x86_64-linux-musl-objcopy || { echo "ERROR: objcopy missing"; exit 1; }
ls -la $OUT/bin/x86_64-linux-musl-readelf || { echo "ERROR: readelf missing"; exit 1; }
ls -la $OUT/bin/x86_64-linux-musl-strip || { echo "ERROR: strip missing"; exit 1; }
echo "=== All key outputs present ==="

# Create unprefixed symlinks matching original binutils-musl layout
for tool in ar as ld nm objcopy objdump ranlib readelf strip addr2line c++filt elfedit size strings gprof; do
  if [ -x "$OUT/bin/x86_64-linux-musl-$tool" ] && [ ! -e "$OUT/bin/$tool" ]; then
    ln -sf "x86_64-linux-musl-$tool" "$OUT/bin/$tool"
  fi
done

# ld.bfd symlinks
if [ ! -e "$OUT/bin/x86_64-linux-musl-ld.bfd" ]; then
  ln -sf x86_64-linux-musl-ld "$OUT/bin/x86_64-linux-musl-ld.bfd"
fi
if [ ! -e "$OUT/bin/ld.bfd" ]; then
  ln -sf x86_64-linux-musl-ld "$OUT/bin/ld.bfd"
fi
if [ -x "$OUT/bin/x86_64-linux-musl-ld.gold" ] && [ ! -e "$OUT/bin/ld.gold" ]; then
  ln -sf x86_64-linux-musl-ld.gold "$OUT/bin/ld.gold"
fi
`,
  deps: [
    dep("toolchain", nativeToolchainRecipe),
    dep("source", binutilsSourceRecipe),
  ],
});

await importToStore(recipe);
export const binutilsMuslStage2Recipe = recipe;
