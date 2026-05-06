//! validate-gcc-stage2-c — verifies gcc-stage2-c is a glibc-hosted compiler.
//!
//! Checks:
//! 1. gcc-stage2-c runs and reports version
//! 2. gcc-stage2-c is glibc-linked (not musl)
//! 3. Can compile and run a C hello-world
//! 4. Compiled binary links against glibc
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { hodSeedRootRecipe } from "../bootstrap/hod-seed-root.js";
import { gccStage2CRecipe } from "./gcc-stage2-c.js";
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
echo '=== gcc-stage2-c version ==='
/deps/gcc-stage2/bin/gcc --version

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

echo '=== run compiled hello ==='
/tmp/build/hello

# === Test 4: Verify output binary links against glibc ===
echo '=== output ELF interpreter ==='
/deps/binutils/bin/readelf -l /tmp/build/hello | grep 'Requesting program interpreter'
/deps/binutils/bin/readelf -d /tmp/build/hello | grep NEEDED

if ! /deps/binutils/bin/readelf -d /tmp/build/hello | grep -q 'libc.so.6'; then
  echo 'FAIL: output does not link against glibc libc.so.6'
  exit 1
fi

if /deps/binutils/bin/readelf -l /tmp/build/hello | grep -q 'ld-musl'; then
  echo 'FAIL: output uses musl interpreter'
  exit 1
fi

echo 'PASS: output binary links against glibc'

# === Save artifacts ===
mkdir -p $OUT
cp /tmp/build/hello $OUT/hello
echo 'gcc-stage2-c validation passed' > $OUT/result.txt`,
  ],
  env: [
    // Override auto-env C_INCLUDE_PATH to prevent musl headers from
    // contaminating glibc compilations. gcc-stage2 finds its own headers
    // via --sysroot; it doesn't need C_INCLUDE_PATH at all.
    { key: "C_INCLUDE_PATH", value: "" },
  ],
  dependencies: [
    dep("binutils", binutilsRecipe),
    dep("gcc-stage2", gccStage2CRecipe),
    dep("glibc", glibcRecipe),
    dep("linux-headers", linuxHeadersRecipe),
    dep("seed", hodSeedRootRecipe),
  ],
});

await importToStore(recipe);
export const validateGccStage2CRecipe = recipe;
