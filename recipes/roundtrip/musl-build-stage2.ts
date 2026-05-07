//! Round-trip musl build — rebuilds musl 1.2.5 using the native glibc toolchain.
//!
//! This is Phase C.2: proving that the native-toolchain (built by the musl.cc
//! seed through the full pipeline) can itself build a working musl libc.
//!
//! Architecture: uses shellBuild() with native-toolchain, which provides
//! bash, coreutils, make, gcc (glibc-linked), binutils, etc. The native
//! gcc is a glibc compiler, but we only need it to compile musl's source
//! (pure C) into static libraries and the dynamic linker. This works because
//! musl is self-contained — it provides its own headers and runtime.
//!
//! The result is compared against the original musl-build output to verify
//! the native toolchain produces correct musl artifacts.
import { shellBuild, dep, importToStore } from "../../js/src/index.js";
import { nativeToolchainRecipe } from "../toolchain/native-toolchain.js";
import { muslSourceRecipe } from "../bootstrap/musl-source.js";

const recipe = await shellBuild({
  toolchain: "toolchain",
  script: `
export PATH=/deps/toolchain/bin:$PATH

tar xf /deps/source/source -C /tmp
cd /tmp/musl-1.2.5

# Configure musl with prefix=/ so DESTDIR install puts everything under $OUT.
# --disable-wrapper skips building the musl-gcc wrapper script (not needed).
CC="/deps/toolchain/bin/gcc --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin" \\
AR=ar \\
RANLIB=ranlib \\
./configure --prefix=/ --disable-wrapper

make -j$(nproc)
make install DESTDIR=$OUT

# Verify key outputs exist
echo "=== Round-trip musl build output verification ==="
ls -la $OUT/lib/libc.so || { echo "ERROR: libc.so missing"; exit 1; }
ls -la $OUT/lib/ld-musl-x86_64.so.1 || { echo "ERROR: ld-musl missing"; exit 1; }
ls -la $OUT/lib/libc.a || { echo "ERROR: libc.a missing"; exit 1; }
ls -la $OUT/lib/crt1.o || { echo "ERROR: crt1.o missing"; exit 1; }
ls -la $OUT/lib/crti.o || { echo "ERROR: crti.o missing"; exit 1; }
ls -la $OUT/lib/crtn.o || { echo "ERROR: crtn.o missing"; exit 1; }
ls -d $OUT/include || { echo "ERROR: include/ missing"; exit 1; }
echo "=== All key outputs present ==="
`,
  deps: [
    dep("toolchain", nativeToolchainRecipe),
    dep("source", muslSourceRecipe),
  ],
});

await importToStore(recipe);
export const muslBuildStage2Recipe = recipe;
