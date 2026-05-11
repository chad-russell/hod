//! validate-gcc-stage2 — verifies full gcc-stage2 (C + C++) is glibc-hosted.
//!
//! Checks:
//! 1. gcc-stage2 runs and reports version (both gcc and g++)
//! 2. gcc-stage2 is glibc-linked (not musl)
//! 3. Can compile and run C hello-world
//! 4. Can compile and run C++ hello-world
//! 5. Compiled binaries link against glibc
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { hodSeedRootRecipe } from "../bootstrap/hod-seed-root.js";
import { gccStage2Recipe } from "./gcc-stage2.js";
import { binutilsRecipe } from "../native/binutils.js";
import { glibcRecipe } from "../cross/glibc.js";
import { linuxHeadersRecipe } from "../cross/linux-headers.js";

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

# === Test 1: Version check ===
echo '=== gcc-stage2 version ==='
/deps/gcc-stage2/bin/gcc --version
/deps/gcc-stage2/bin/g++ --version

# === Test 2: ELF interpreter check ===
echo '=== compiler ELF interpreter ==='
/deps/binutils/bin/readelf -l /deps/gcc-stage2/bin/gcc | grep 'Requesting program interpreter' || true
/deps/binutils/bin/readelf -d /deps/gcc-stage2/bin/gcc | grep NEEDED || true

if /deps/binutils/bin/readelf -l /deps/gcc-stage2/bin/gcc | grep -q 'ld-musl'; then
  echo 'FAIL: gcc-stage2 is musl-linked'
  exit 1
fi

if ! /deps/binutils/bin/readelf -l /deps/gcc-stage2/bin/gcc | grep -q 'ld-linux-x86-64'; then
  echo 'FAIL: gcc-stage2 does not use glibc dynamic linker'
  exit 1
fi

echo 'PASS: gcc-stage2 uses glibc dynamic linker'

# === Test 3: Compile and run C hello world ===
mkdir -p /tmp/build
cat > /tmp/build/hello.c << 'EOF'
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void) {
  char *buf = malloc(64);
  strcpy(buf, "hello from gcc-stage2-c");
  puts(buf);
  free(buf);
  return 0;
}
EOF

/deps/gcc-stage2/bin/gcc \\
  --sysroot=/tmp/sysroot \\
  -B/deps/binutils/bin \\
  -O2 \\
  /tmp/build/hello.c \\
  -o /tmp/build/hello

echo '=== run compiled C hello ==='
/tmp/build/hello

# === Test 4: Verify C output binary links against glibc ===
echo '=== C output ELF interpreter ==='
/deps/binutils/bin/readelf -l /tmp/build/hello | grep 'Requesting program interpreter'
/deps/binutils/bin/readelf -d /tmp/build/hello | grep NEEDED

if ! /deps/binutils/bin/readelf -d /tmp/build/hello | grep -q 'libc.so.6'; then
  echo 'FAIL: C output does not link against glibc libc.so.6'
  exit 1
fi

echo 'PASS: C output binary links against glibc'

# === Test 5: Compile and run C++ hello world ===
cat > /tmp/build/hello.cc << 'EOF'
#include <iostream>
#include <vector>
#include <string>

int main() {
  std::vector<std::string> words = {"hello", "from", "gcc-stage2", "c++"};
  for (const auto &word : words) {
    std::cout << word << " ";
  }
  std::cout << std::endl;
  return 0;
}
EOF

/deps/gcc-stage2/bin/g++ \\
  --sysroot=/tmp/sysroot \\
  -B/deps/binutils/bin \\
  -O2 \\
  -Wl,-rpath,/deps/gcc-stage2/lib64 \\
  -Wl,-rpath,/deps/gcc-stage2/lib \\
  /tmp/build/hello.cc \\
  -o /tmp/build/hello-cpp

echo '=== run compiled C++ hello ==='
/tmp/build/hello-cpp

# === Test 6: Verify C++ output binary links correctly ===
echo '=== C++ output ELF interpreter ==='
/deps/binutils/bin/readelf -l /tmp/build/hello-cpp | grep 'Requesting program interpreter'
/deps/binutils/bin/readelf -d /tmp/build/hello-cpp | grep NEEDED

if ! /deps/binutils/bin/readelf -d /tmp/build/hello-cpp | grep -q 'libc.so.6'; then
  echo 'FAIL: C++ output does not link against glibc libc.so.6'
  exit 1
fi

echo 'PASS: C++ output binary links against glibc'

# === Save artifacts ===
mkdir -p $OUT
cp /tmp/build/hello $OUT/hello
cp /tmp/build/hello-cpp $OUT/hello-cpp
echo 'gcc-stage2 validation passed' > $OUT/result.txt`,
  ],
  env: [
    // Set C_INCLUDE_PATH explicitly to prevent musl header contamination
    { key: "C_INCLUDE_PATH", value: "" },
  ],
  dependencies: [
    dep("binutils", binutilsRecipe),
    dep("gcc-stage2", gccStage2Recipe),
    dep("glibc", glibcRecipe),
    dep("linux-headers", linuxHeadersRecipe),
    dep("seed", hodSeedRootRecipe),
  ],
});

await importToStore(recipe);
export const validateGccStage2Recipe = recipe;
