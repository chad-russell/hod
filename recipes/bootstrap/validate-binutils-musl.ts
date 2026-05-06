//! Validate binutils musl build — smoke test that the Hod-built binutils work.
//!
//! Tests that the built binutils can assemble, link, and inspect a simple
//! program when used with the seed's gcc and our Hod-built musl.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { seedRootRecipe } from "./seed-root.js";
import { binutilsMuslRecipe } from "./binutils-musl.js";
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

# Point to the Hod-built binutils
export PATH=/deps/binutils/bin:/deps/seed/bin

echo "=== Test 1: Verify binutils version ==="
x86_64-linux-musl-as --version | head -1
x86_64-linux-musl-ld --version | head -1
x86_64-linux-musl-ar --version | head -1
x86_64-linux-musl-readelf --version | head -1
x86_64-linux-musl-objdump --version | head -1

echo "=== Test 2: Compile with seed gcc + Hod-built binutils ==="
# Create a gcc wrapper that uses Hod-built musl + binutils
mkdir -p /tmp/gcc-wrapper
cat > /tmp/gcc-wrapper/gcc << 'WRAPPER'
#!/bin/sh
exec /deps/seed/bin/gcc \\
  -B/deps/seed/libexec/gcc/x86_64-linux-musl/11.2.1/ \\
  -B/deps/seed/lib/gcc/x86_64-linux-musl/11.2.1/ \\
  -B/deps/binutils/x86_64-linux-musl/lib/ \\
  -I/deps/musl/include \\
  -L/deps/musl/lib \\
  -B/deps/binutils/bin/x86_64-linux-musl- \\
  "$@"
WRAPPER
chmod +x /tmp/gcc-wrapper/gcc

export PATH=/tmp/gcc-wrapper:/deps/binutils/bin:/deps/seed/bin

cat > /tmp/test.c << 'EOF'
#include <stdio.h>
int main() {
    printf("hello from Hod-built binutils!\\n");
    return 0;
}
EOF
gcc -o /tmp/test /tmp/test.c
/tmp/test

echo "=== Test 3: Verify binary uses musl dynamic linker ==="
/deps/binutils/bin/x86_64-linux-musl-readelf -l /tmp/test | grep interpreter

echo "=== Test 4: Test ar archiving ==="
echo 'int foo() { return 42; }' > /tmp/foo.c
gcc -c -o /tmp/foo.o /tmp/foo.c
x86_64-linux-musl-ar rcs /tmp/libfoo.a /tmp/foo.o
x86_64-linux-musl-ar t /tmp/libfoo.a

echo "=== Test 5: Test objdump disassembly ==="
x86_64-linux-musl-objdump -d /tmp/foo.o | head -5

echo "=== Test 6: Test strip ==="
cp /tmp/test /tmp/test.stripped
x86_64-linux-musl-strip /tmp/test.stripped
echo "Original size: $(wc -c < /tmp/test)"
echo "Stripped size: $(wc -c < /tmp/test.stripped)"

echo "=== All binutils validation tests passed ==="

# Copy results to output
cp /tmp/test $OUT/test-dynamic
cp /tmp/test.stripped $OUT/test-stripped
echo "pass" > $OUT/result.txt`,
  ],
  dependencies: [
    dep("binutils", binutilsMuslRecipe),
    dep("musl", muslBuildRecipe),
    dep("seed", seedRootRecipe),
  ],
});

await importToStore(recipe);
export const validateBinutilsMuslRecipe = recipe;
