//! validate-stage1 recipe — verifies gcc-stage1/glibc can compile and run a hello-world.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { hodSeedRootRecipe } from "../bootstrap/hod-seed-root.js";
import { gccStage1Recipe } from "./gcc-stage1.js";
import { glibcRecipe } from "./glibc.js";
import { linuxHeadersRecipe } from "./linux-headers.js";

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
int main() {
    const char msg[] = "hello from gcc-stage1/glibc\\n";
    write(1, msg, strlen(msg));
    printf("printf works\\n");
    return 0;
}
CEOF

# Compile with -no-pie and a long dummy RUNPATH that the packed
# executable pipeline can patch to $ORIGIN/../lib
/deps/gcc-stage1/bin/x86_64-linux-gnu-gcc \\
  --sysroot=/tmp/sysroot \\
  -B/deps/seed/bin/ \\
  -L/deps/gcc-stage1/lib \\
  -L/deps/gcc-stage1/lib/gcc/x86_64-linux-gnu/13.2.0 \\
  -no-pie \\
  -Wl,-rpath,/this/is/a/very/long/dummy/runpath/for/packing \\
  -o /tmp/hello \\
  /tmp/hello.c

# Verify ELF magic
ELF_MAGIC=$(/deps/seed/bin/busybox od -A n -t x1 -N 4 /tmp/hello | tr -d ' ')
if [ "$ELF_MAGIC" != "7f454c46" ]; then
  echo "ERROR: not a valid ELF binary, magic=$ELF_MAGIC"
  exit 1
fi

# Run the compiled binary
/tmp/hello > /tmp/output.txt 2>&1 || { echo "FAILED to run binary"; exit 1; }

cp /tmp/hello $OUT/hello
cp /tmp/output.txt $OUT/output.txt

echo "gcc-stage1 validation complete"`,
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
});

await importToStore(recipe);
export const validateStage1Recipe = recipe;
