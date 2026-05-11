//! make shim build recipe.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { seedRootRecipe } from "../bootstrap/seed-root.js";
import { makeSourceRecipe } from "./make-source.js";

const preamble = hermeticPreamble({ shell: "seed", muslLinker: "seed" });

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

${preamble}

export PATH=/tmp/gcc-wrapper:/deps/seed/bin

# The seed musl gcc has hardcoded paths from the host staging directory.
# In the sandbox those don't exist. We create a wrapper that uses -B
# flags to point gcc at the right subprogram/library directories.
mkdir -p /tmp/gcc-wrapper
cat > /tmp/gcc-wrapper/gcc << 'WRAPPER'
#!/bin/sh
exec /deps/seed/bin/gcc \\
  -B/deps/seed/libexec/gcc/x86_64-linux-musl/11.2.1/ \\
  -B/deps/seed/lib/gcc/x86_64-linux-musl/11.2.1/ \\
  -B/deps/seed/x86_64-linux-musl/lib/ \\
  "$@"
WRAPPER
chmod +x /tmp/gcc-wrapper/gcc

/tmp/gcc-wrapper/gcc --version | head -1

tar xf /deps/source/source -C /tmp
cd /tmp/make-*

CC=/tmp/gcc-wrapper/gcc \\
AR=/deps/seed/bin/ar \\
RANLIB=/deps/seed/bin/ranlib \\
CFLAGS="-O2" \\
LDFLAGS="-static" \\
./configure --prefix=/ --disable-dependency-tracking

sh build.sh

mkdir -p $OUT/bin
cp make $OUT/bin/make
chmod +x $OUT/bin/make`,
  ],
  dependencies: [
    dep("seed", seedRootRecipe),
    dep("source", makeSourceRecipe),
  ],
});

await importToStore(recipe);
export const makeRecipe = recipe;
