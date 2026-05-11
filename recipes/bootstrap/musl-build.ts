//! musl libc build from source.
//!
//! Builds musl 1.2.5 using the seed's musl gcc (11.2.1).
//! Produces: lib/libc.so, lib/ld-musl-x86_64.so.1, lib/libc.a,
//! lib/crt*.o, lib/libm.a (and other empty stubs), include/.
//!
//! This is the C library portion of the eventual Hod-built musl toolchain.
//! Phases 2-3 will add binutils and gcc to produce a complete toolchain.
//!
//! Key bootstrap detail: the seed gcc has hardcoded internal paths from
//! its host staging directory. We create a wrapper script that uses -B
//! flags to point gcc at the right subprogram/library directories, following
//! the same pattern as busybox-native.ts.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { seedRootRecipe } from "./seed-root.js";
import { muslSourceRecipe } from "./musl-source.js";
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
# In the sandbox those don't exist. We create a wrapper that uses -B
# flags to point gcc at the right subprogram/library directories.
#
# NOTE: No -I or -L flags! musl's configure uses -nostdinc and provides
# its own headers. Injecting the seed's musl headers (-I/deps/seed/include)
# would conflict with musl's own headers, causing weak_alias expansion
# failures. The -B flags are sufficient for GCC to find cc1, collect2,
# crt*.o, libgcc.a, etc.
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

# Extract musl source
tar xf /deps/source/source -C /tmp
cd /tmp/musl-1.2.5

# Configure musl with prefix=/ so DESTDIR install puts everything under $OUT.
# --disable-wrapper skips building the musl-gcc wrapper script (not needed).
CC=/tmp/gcc-wrapper/gcc \\
AR=/deps/seed/bin/ar \\
RANLIB=/deps/seed/bin/ranlib \\
./configure --prefix=/ --disable-wrapper

# Build and install
$MAKE -j$(nproc)
$MAKE install DESTDIR=$OUT

# Verify key outputs exist
echo "=== Musl build output verification ==="
ls -la $OUT/lib/libc.so || { echo "ERROR: libc.so missing"; exit 1; }
ls -la $OUT/lib/ld-musl-x86_64.so.1 || { echo "ERROR: ld-musl missing"; exit 1; }
ls -la $OUT/lib/libc.a || { echo "ERROR: libc.a missing"; exit 1; }
ls -la $OUT/lib/crt1.o || { echo "ERROR: crt1.o missing"; exit 1; }
ls -la $OUT/lib/crti.o || { echo "ERROR: crti.o missing"; exit 1; }
ls -la $OUT/lib/crtn.o || { echo "ERROR: crtn.o missing"; exit 1; }
ls -d $OUT/include || { echo "ERROR: include/ missing"; exit 1; }
echo "=== All key outputs present ==="`,
  ],
  dependencies: [
    dep("make", shimMakeRecipe),
    dep("seed", seedRootRecipe),
    dep("source", muslSourceRecipe),
  ],
});

await importToStore(recipe);
export const muslBuildRecipe = recipe;
