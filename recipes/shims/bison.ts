//! bison shim build recipe.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { seedRootRecipe } from "../bootstrap/seed-root.js";
import { m4Recipe } from "./m4.js";
import { bisonSourceRecipe } from "./bison-source.js";
import { makeRecipe } from "./make.js";

const preamble = hermeticPreamble({ shell: "seed", muslLinker: "seed" });

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

${preamble}

export PATH=/tmp/gcc-wrapper:/deps/m4/bin:/deps/make/bin:/deps/seed/bin
MAKE=/deps/make/bin/make

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

# Verify the wrapper works
/tmp/gcc-wrapper/gcc --version | head -1

tar xf /deps/source/source -C /tmp
cd /tmp/bison-*

CC=/tmp/gcc-wrapper/gcc \\
AR=/deps/seed/bin/ar \\
RANLIB=/deps/seed/bin/ranlib \\
CFLAGS="-O2" \\
LDFLAGS="-static" \\
./configure --prefix=/ --disable-dependency-tracking

$MAKE -j$(nproc)
$MAKE install DESTDIR=$OUT

# Remove unnecessary files
rm -rf $OUT/share/info $OUT/share/man $OUT/share/doc

# Verify bison works
$OUT/bin/bison --version | head -1`,
  ],
  dependencies: [
    dep("m4", m4Recipe),
    dep("make", makeRecipe),
    dep("seed", seedRootRecipe),
    dep("source", bisonSourceRecipe),
  ],
});

await importToStore(recipe);
export const bisonRecipe = recipe;
