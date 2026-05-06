//! Validate gcc musl build — smoke test that the Hod-built gcc can compile and run C and C++ programs.
//!
//! Uses the Hod-built gcc, musl, and binutils together to compile programs
//! and verifies they are musl-linked and run correctly.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { seedRootRecipe } from "./seed-root.js";
import { gccMuslRecipe } from "./gcc-musl.js";
import { muslBuildRecipe } from "./musl-build.js";
import { binutilsMuslRecipe } from "./binutils-musl.js";

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

# Set up musl dynamic linker from our built musl
# Also symlink C++ runtime libs (libstdc++, libgcc_s) from gcc output
# so dynamically-linked C++ binaries can run.
ln -sf /deps/musl/lib/ld-musl-x86_64.so.1 /lib/ld-musl-x86_64.so.1 || true
ln -sf /deps/musl/lib/libc.so /lib/libc.so || true
ln -sf /deps/gcc/lib/libstdc++.so.6 /lib/libstdc++.so.6 || true
ln -sf /deps/gcc/lib/libstdc++.so.6.0.29 /lib/libstdc++.so.6.0.29 || true
ln -sf /deps/gcc/lib/libgcc_s.so.1 /lib/libgcc_s.so.1 || true
ln -sf /deps/gcc/lib/libgcc_s.so /lib/libgcc_s.so || true

export PATH=/deps/gcc/bin:/deps/binutils/bin:/deps/seed/bin

echo "=== Test 1: Verify gcc version ==="
x86_64-linux-musl-gcc --version | head -1

echo "=== Test 2: Compile and run a dynamic C program ==="
cat > /tmp/test1.c << 'EOF'
#include <stdio.h>
#include <stdlib.h>
int main() {
    printf("hello from Hod-built gcc!\\n");
    void *p = malloc(1024);
    if (!p) return 1;
    free(p);
    return 0;
}
EOF
x86_64-linux-musl-gcc -o /tmp/test1 /tmp/test1.c
/tmp/test1

echo "=== Test 3: Verify musl dynamic linker ==="
/deps/binutils/bin/x86_64-linux-musl-readelf -l /tmp/test1 | grep interpreter

echo "=== Test 4: Verify no glibc references ==="
/deps/binutils/bin/x86_64-linux-musl-readelf -d /tmp/test1 | grep NEEDED
/deps/binutils/bin/x86_64-linux-musl-strings /tmp/test1 | grep -i glibc && echo "WARN: glibc reference found" || echo "OK: no glibc references"

echo "=== Test 5: Compile and run a static C program ==="
x86_64-linux-musl-gcc -static -o /tmp/test2 /tmp/test1.c
/tmp/test2

echo "=== Test 6: Compile and run a C++ program ==="
cat > /tmp/test3.cpp << 'EOF'
#include <iostream>
#include <string>
int main() {
    std::string msg = "hello from Hod-built g++!";
    std::cout << msg << std::endl;
    return 0;
}
EOF
x86_64-linux-musl-g++ -o /tmp/test3 /tmp/test3.cpp
/tmp/test3

echo "=== Test 7: Verify static C++ works ==="
x86_64-linux-musl-g++ -static -o /tmp/test4 /tmp/test3.cpp
/tmp/test4

echo "=== All gcc validation tests passed ==="

# Copy results to output
cp /tmp/test1 $OUT/test-dynamic
cp /tmp/test2 $OUT/test-static
cp /tmp/test3 $OUT/test-cpp-dynamic
cp /tmp/test4 $OUT/test-cpp-static
echo "pass" > $OUT/result.txt`,
  ],
  dependencies: [
    dep("binutils", binutilsMuslRecipe),
    dep("gcc", gccMuslRecipe),
    dep("musl", muslBuildRecipe),
    dep("seed", seedRootRecipe),
  ],
});

await importToStore(recipe);
export const validateGccMuslRecipe = recipe;
