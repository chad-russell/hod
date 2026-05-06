//! validate-selfhost recipe — comprehensive self-hosting toolchain validation.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { hodSeedRootRecipe } from "../bootstrap/hod-seed-root.js";
import { shimsBundleRecipe } from "../shims/shims-bundle.js";
import { gccStage1Recipe } from "../cross/gcc-stage1.js";
import { glibcRecipe } from "../cross/glibc.js";
import { linuxHeadersRecipe } from "../cross/linux-headers.js";
import { binutilsRecipe } from "./binutils.js";

const preamble = hermeticPreamble({
  shell: "seed",
  muslLinker: "seed",
  glibcLinker: "glibc",
  sysroot: { glibc: "glibc", linuxHeaders: "linux-headers" },
});

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

${preamble}

echo "=== Hod Self-Hosting Validation ==="
echo

# Test 1: Version checks for build tools (all available inside sandbox)
echo "--- Test 1: Build tool versions ---"
/deps/gcc-stage1/bin/x86_64-linux-gnu-gcc --version | head -1
/deps/shims/bin/make --version | head -1
/deps/binutils/bin/readelf --version | head -1
/deps/seed/bin/busybox --help | head -1
echo

# Test 2: Compile a multi-file C program using make
echo "--- Test 2: Multi-file C program with make ---"
mkdir -p /tmp/build

cat > /tmp/build/main.c << 'EOF'
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "util.h"

int main(int argc, char *argv[]) {
    printf("hello from self-hosting hod!\\n");
    printf("greeting: %s\\n", get_greeting());
    printf("add(2,3) = %d\\n", add(2, 3));
    printf("argc=%d argv[0]=%s\\n", argc, argv[0]);

    // Test malloc
    char *buf = malloc(1024);
    if (buf) {
        strcpy(buf, "malloc works");
        printf("%s\\n", buf);
        free(buf);
    }

    // Test file I/O
    FILE *f = fopen("/tmp/build/testfile.txt", "w");
    if (f) {
        fprintf(f, "file I/O works\\n");
        fclose(f);
    }
    f = fopen("/tmp/build/testfile.txt", "r");
    if (f) {
        char line[256];
        if (fgets(line, sizeof(line), f)) {
            printf("read: %s", line);
        }
        fclose(f);
    }

    return 0;
}
EOF

cat > /tmp/build/util.h << 'EOF'
const char *get_greeting(void);
int add(int a, int b);
EOF

cat > /tmp/build/util.c << 'EOF'
#include "util.h"
const char *get_greeting(void) { return "from hermetic toolchain"; }
int add(int a, int b) { return a + b; }
EOF

cat > /tmp/build/Makefile << 'MAKEEOF'
CC = /deps/gcc-stage1/bin/x86_64-linux-gnu-gcc --sysroot=/tmp/sysroot -B/deps/seed/bin/
CFLAGS = -O2 -no-pie
LDFLAGS = -L/deps/gcc-stage1/lib -L/deps/gcc-stage1/lib/gcc/x86_64-linux-gnu/13.2.0

all: hello

hello: main.o util.o
	$(CC) $(CFLAGS) $(LDFLAGS) -o hello main.o util.o

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

.PHONY: clean
clean:
	rm -f *.o hello
MAKEEOF

cd /tmp/build
/deps/shims/bin/make
echo

# Test 3: Run the compiled binary
echo "--- Test 3: Run compiled binary ---"
/tmp/build/hello
echo

# Test 4: Inspect the binary - verify glibc linkage and no musl
echo "--- Test 4: Binary inspection ---"
/deps/binutils/bin/readelf -d /tmp/build/hello 2>&1 | grep NEEDED
/deps/binutils/bin/readelf -l /tmp/build/hello 2>&1 | grep INTERP

# Check for musl references - this should find nothing
if strings /tmp/build/hello | grep -q musl 2>/dev/null; then
  echo "FAIL: binary contains musl references"
  exit 1
else
  echo "PASS: no musl references found"
fi

# Verify binary is dynamically linked to glibc
if /deps/binutils/bin/readelf -d /tmp/build/hello | grep -q 'NEEDED.*libc.so.6'; then
  echo "PASS: linked against glibc (libc.so.6)"
else
  echo "FAIL: not linked against glibc"
  exit 1
fi

# Verify binary uses glibc dynamic linker
if /deps/binutils/bin/readelf -l /tmp/build/hello | grep -q 'interp.*ld-linux-x86-64'; then
  echo "PASS: uses glibc dynamic linker (ld-linux-x86-64.so.2)"
else
  echo "FAIL: not using glibc dynamic linker"
  exit 1
fi

echo

# Test 5: Strip the binary with hermetic strip
/deps/seed/bin/strip /tmp/build/hello
echo "PASS: strip succeeded"
echo

# Write outputs
mkdir -p $OUT
cp /tmp/build/hello $OUT/hello
echo "all self-hosting validation tests passed" > $OUT/result.txt

echo "=== All self-hosting validation tests passed ==="`,
  ],
  env: [
    { key: "C_INCLUDE_PATH", value: "/deps/gcc-stage1/include:/deps/glibc/include:/deps/linux-headers/include" },
    { key: "LIBRARY_PATH", value: "/deps/glibc/lib:/deps/gcc-stage1/lib:/deps/gcc-stage1/lib/gcc/x86_64-linux-gnu/13.2.0" },
  ],
  dependencies: [
    dep("binutils", binutilsRecipe),
    dep("gcc-stage1", gccStage1Recipe),
    dep("glibc", glibcRecipe),
    dep("linux-headers", linuxHeadersRecipe),
    dep("seed", hodSeedRootRecipe),
    dep("shims", shimsBundleRecipe),
  ],
  runtime_deps: ["glibc"],
});

await importToStore(recipe);
export const validateSelfhostRecipe = recipe;
