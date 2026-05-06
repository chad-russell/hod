//! validate-reloc recipe — verifies store-relative binary relocation.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { hodSeedRootRecipe } from "../bootstrap/hod-seed-root.js";
import { gccStage1Recipe } from "../cross/gcc-stage1.js";
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

# Write test program
cat > /tmp/hello.c << 'CEOF'
#include <stdio.h>
#include <unistd.h>
#include <string.h>
int main(int argc, char **argv) {
    const char msg[] = "hello from store-relative binary\\n";
    write(1, msg, strlen(msg));
    printf("printf works: argc=%d argv[0]=%s\\n", argc, argv[0]);
    return 0;
}
CEOF

# Compile with a long dummy RUNPATH that the relocation pass can patch.
# -no-pie produces ET_EXEC which is simpler for bootstrap injection.
/deps/gcc-stage1/bin/x86_64-linux-gnu-gcc \\
  --sysroot=/tmp/sysroot \\
  -B/deps/seed/bin/ \\
  -L/deps/gcc-stage1/lib \\
  -L/deps/gcc-stage1/lib/gcc/x86_64-linux-gnu/13.2.0 \\
  -no-pie \\
  -Wl,-rpath,/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/dummy \\
  -o /tmp/hello \\
  /tmp/hello.c

# Verify ELF magic
ELF_MAGIC=$(/deps/seed/bin/busybox od -A n -t x1 -N 4 /tmp/hello | tr -d ' ')
if [ "$ELF_MAGIC" != "7f454c46" ]; then
  echo "ERROR: not a valid ELF binary, magic=$ELF_MAGIC"
  exit 1
fi

# Run inside the sandbox to verify it works before relocation
/tmp/hello > /tmp/sandbox_output.txt 2>&1 || { echo "FAILED to run binary in sandbox"; exit 1; }

cp /tmp/hello $OUT/hello
cp /tmp/sandbox_output.txt $OUT/sandbox_output.txt

echo "validate-reloc build complete"`,
  ],
  env: [
    { key: "C_INCLUDE_PATH", value: "/deps/gcc-stage1/include:/deps/glibc/include:/deps/linux-headers/include" },
  ],
  dependencies: [
    dep("gcc-stage1", gccStage1Recipe),
    dep("glibc", glibcRecipe),
    dep("linux-headers", linuxHeadersRecipe),
    dep("seed", hodSeedRootRecipe),
  ],
  runtime_deps: ["glibc"],
});

await importToStore(recipe);
export const validateRelocRecipe = recipe;
