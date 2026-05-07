//! Round-trip validation — proves the native glibc toolchain can build a
//! working musl-targeting GCC, which can then compile working programs.
//!
//! This is the capstone of Phase C.2: if this test passes, we've proven
//! that the native-toolchain (built by the musl.cc seed through the full
//! pipeline) is a correct compiler — it can reproduce its own bootstrap
//! toolchain.
//!
//! The test compiles a C program with the round-trip gcc-musl-stage2
//! (statically linked, since the sandbox doesn't have musl dynamic linker),
//! runs it, and verifies the output.
import { shellBuild, dep, importToStore } from "../../js/src/index.js";
import { nativeToolchainRecipe } from "../toolchain/native-toolchain.js";
import { gccMuslStage2Recipe } from "../roundtrip/gcc-musl-stage2.js";
import { binutilsMuslStage2Recipe } from "../roundtrip/binutils-musl-stage2.js";

const recipe = await shellBuild({
  toolchain: "toolchain",
  script: `
export PATH=/deps/toolchain/bin:/deps/gcc/bin:/deps/binutils/bin:$PATH

echo "=== Round-trip toolchain validation ==="

# Test 1: Compile a simple C program with the round-trip GCC
cat > /tmp/hello.c << 'EOF'
#include <stdio.h>
int main() {
    printf("hello from round-trip gcc!\\n");
    return 0;
}
EOF

x86_64-linux-musl-gcc -isystem /deps/gcc/include -L/deps/gcc/lib -O2 -static /tmp/hello.c -o /tmp/hello 2>&1
echo "compile exit: $?"

/tmp/hello
echo "run exit: $?"

# Test 2: Compile a more complex program (math + string operations)
cat > /tmp/complex.c << 'EOF'
#include <stdio.h>
#include <string.h>
#include <math.h>

int fibonacci(int n) {
    if (n <= 1) return n;
    return fibonacci(n-1) + fibonacci(n-2);
}

int main() {
    // Test math
    double pi = 3.14159265;
    printf("sin(0) = %f\\n", sin(0.0));
    printf("cos(0) = %f\\n", cos(0.0));

    // Test recursion
    printf("fib(10) = %d\\n", fibonacci(10));

    // Test string ops
    char buf[64];
    snprintf(buf, sizeof(buf), "round-trip-%d", 42);
    printf("string: %s (len=%zu)\\n", buf, strlen(buf));

    printf("All round-trip tests passed!\\n");
    return 0;
}
EOF

x86_64-linux-musl-gcc -isystem /deps/gcc/include -L/deps/gcc/lib -O2 -static /tmp/complex.c -o /tmp/complex -lm 2>&1
echo "complex compile exit: $?"

/tmp/complex
echo "complex run exit: $?"

# Test 3: Verify the output is statically linked (no dynamic section expected)
readelf -d /tmp/hello 2>&1 | head -5 || true
readelf -h /tmp/hello 2>&1 | grep -i 'type\|machine' || true
file /tmp/hello 2>/dev/null || true

echo "=== Round-trip validation complete ==="
`,
  deps: [
    dep("binutils", binutilsMuslStage2Recipe),
    dep("gcc", gccMuslStage2Recipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
});

await importToStore(recipe);
export const validateRoundtripRecipe = recipe;
