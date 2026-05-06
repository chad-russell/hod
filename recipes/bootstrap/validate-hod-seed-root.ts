//! Validate the Hod-built seed root — full smoke test.
//!
//! Uses the Hod-built musl toolchain (from source: gcc + binutils + musl)
//! assembled into a seed-root to compile and run C and C++ programs,
//! verifying the entire bootstrap chain works.
//!
//! This validates that the Hod-built toolchain can serve as a drop-in
//! replacement for the pre-built musl.cc toolchain.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { hodSeedRootRecipe } from "./hod-seed-root.js";

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

# Also make C++ runtime libs available for dynamic C++ programs
# (libstdc++ and libgcc_s are in the gcc output but not in /lib/)
ln -sf /deps/seed/lib/libstdc++.so.6 /lib/libstdc++.so.6 2>/dev/null || true
ln -sf /deps/seed/lib/libstdc++.so.6.0.29 /lib/libstdc++.so.6.0.29 2>/dev/null || true
ln -sf /deps/seed/lib/libgcc_s.so.1 /lib/libgcc_s.so.1 2>/dev/null || true
ln -sf /deps/seed/lib/libgcc_s.so /lib/libgcc_s.so 2>/dev/null || true

export PATH=/deps/seed/bin

echo "=== Test 1: Verify gcc version ==="
gcc --version | head -1

echo "=== Test 2: Verify binutils ==="
as --version | head -1
ld --version | head -1
ar --version | head -1

echo "=== Test 3: Compile and run a dynamic C program ==="
cat > /tmp/test1.c << 'EOF'
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
int main() {
    printf("hello from Hod-built toolchain!\\n");
    void *p = malloc(1024);
    if (!p) return 1;
    memset(p, 0, 1024);
    free(p);
    return 0;
}
EOF
gcc -o /tmp/test1 /tmp/test1.c
/tmp/test1

echo "=== Test 4: Verify musl dynamic linker ==="
readelf -l /tmp/test1 | grep interpreter

echo "=== Test 5: Verify no glibc references ==="
readelf -d /tmp/test1 | grep NEEDED
strings /tmp/test1 | grep -i glibc && echo "WARN: glibc reference found" || echo "OK: no glibc references"

echo "=== Test 6: Compile and run a static C program ==="
gcc -static -o /tmp/test2 /tmp/test1.c
/tmp/test2

echo "=== Test 7: Compile and run a C++ program ==="
cat > /tmp/test3.cpp << 'EOF'
#include <iostream>
#include <string>
#include <vector>
int main() {
    std::string msg = "hello from Hod-built g++!";
    std::vector<int> v = {1, 2, 3, 4, 5};
    int sum = 0;
    for (int x : v) sum += x;
    std::cout << msg << " sum=" << sum << std::endl;
    return 0;
}
EOF
g++ -o /tmp/test3 /tmp/test3.cpp
/tmp/test3

echo "=== Test 8: Verify static C++ works ==="
g++ -static -o /tmp/test4 /tmp/test3.cpp
/tmp/test4

echo "=== Test 9: Compile with optimization ==="
gcc -O2 -o /tmp/test5 /tmp/test1.c
/tmp/test5

echo "=== Test 10: Compile a multi-file C program ==="
cat > /tmp/hello.c << 'EOF'
#include <stdio.h>
extern void helper(void);
int main() { puts("main"); helper(); return 0; }
EOF
cat > /tmp/helper.c << 'EOF'
#include <stdio.h>
void helper(void) { puts("helper"); }
EOF
gcc -o /tmp/multifile /tmp/hello.c /tmp/helper.c
/tmp/multifile

echo "=== All hod-seed-root validation tests passed ==="

# Copy results to output
cp /tmp/test1 $OUT/test-dynamic
cp /tmp/test2 $OUT/test-static
cp /tmp/test3 $OUT/test-cpp-dynamic
cp /tmp/test4 $OUT/test-cpp-static
echo "pass" > $OUT/result.txt`,
  ],
  dependencies: [
    dep("seed", hodSeedRootRecipe),
  ],
});

await importToStore(recipe);
export const validateHodSeedRootRecipe = recipe;
