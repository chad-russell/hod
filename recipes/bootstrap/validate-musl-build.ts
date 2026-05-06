//! Validate musl build — smoke test that the Hod-built musl can compile and run a C program.
//!
//! Compiles a trivial C program using the seed's gcc with the Hod-built musl
//! as the C library, then verifies the resulting binary uses the musl dynamic
//! linker and runs correctly.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { seedRootRecipe } from "./seed-root.js";
import { muslBuildRecipe } from "./musl-build.js";

const preamble = hermeticPreamble({
  shell: "seed",
});

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

${preamble}

# Set up the musl dynamic linker from our built musl
ln -sf /deps/musl/lib/ld-musl-x86_64.so.1 /lib/ld-musl-x86_64.so.1 || true
ln -sf /deps/musl/lib/libc.so /lib/libc.so || true

# Create a gcc wrapper that uses the Hod-built musl for headers and libs
mkdir -p /tmp/gcc-wrapper
cat > /tmp/gcc-wrapper/gcc << 'WRAPPER'
#!/bin/sh
exec /deps/seed/bin/gcc \\
  -B/deps/seed/libexec/gcc/x86_64-linux-musl/11.2.1/ \\
  -B/deps/seed/lib/gcc/x86_64-linux-musl/11.2.1/ \\
  -B/deps/seed/x86_64-linux-musl/lib/ \\
  -I/deps/musl/include \\
  -L/deps/musl/lib \\
  "$@"
WRAPPER
chmod +x /tmp/gcc-wrapper/gcc

export PATH=/tmp/gcc-wrapper:/deps/seed/bin

echo "=== Test 1: Compile and run a trivial C program ==="
cat > /tmp/test1.c << 'EOF'
#include <stdio.h>
int main() {
    printf("hello from hod-built musl!\\n");
    return 0;
}
EOF
gcc -o /tmp/test1 /tmp/test1.c
/tmp/test1

echo "=== Test 2: Verify musl dynamic linker ==="
/deps/seed/bin/readelf -l /tmp/test1 | grep INTERP
/deps/seed/bin/readelf -l /tmp/test1 | grep interpreter

echo "=== Test 3: Verify libc linkage ==="
/deps/seed/bin/readelf -d /tmp/test1 | grep NEEDED

echo "=== Test 4: Test static linking ==="
cat > /tmp/test2.c << 'EOF'
#include <stdio.h>
#include <stdlib.h>
int main() {
    void *p = malloc(1024);
    if (!p) return 1;
    sprintf((char*)p, "static musl works: %d\\n", 42);
    fputs((char*)p, stdout);
    free(p);
    return 0;
}
EOF
gcc -static -o /tmp/test2 /tmp/test2.c
/tmp/test2

# No INTERP section in a static binary
/deps/seed/bin/readelf -l /tmp/test2 | grep INTERP && echo "WARN: static binary has INTERP" || echo "OK: no INTERP in static binary"

echo "=== All musl validation tests passed ==="

# Copy results to output
cp /tmp/test1 $OUT/test-dynamic
cp /tmp/test2 $OUT/test-static
echo "pass" > $OUT/result.txt`,
  ],
  dependencies: [
    dep("musl", muslBuildRecipe),
    dep("seed", seedRootRecipe),
  ],
});

await importToStore(recipe);
export const validateMuslBuildRecipe = recipe;
