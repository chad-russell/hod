//! patch shim build recipe.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { seedRootRecipe } from "../bootstrap/seed-root.js";
import { makeRecipe } from "./make.js";
import { patchSourceRecipe } from "./patch-source.js";

const preamble = hermeticPreamble({ shell: "seed", muslLinker: "seed" });

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

${preamble}

tar xf /deps/source/source -C /tmp
cd /tmp/patch-*

CC=/deps/seed/bin/gcc \\
AR=/deps/seed/bin/ar \\
RANLIB=/deps/seed/bin/ranlib \\
CFLAGS="-O2" \\
LDFLAGS="-static" \\
./configure --prefix=/ --disable-dependency-tracking

make
make install DESTDIR=$OUT

# Keep only the bin directory
rm -rf $OUT/share $OUT/lib $OUT/include $OUT/etc 2>/dev/null || true`,
  ],
  dependencies: [
    dep("make", makeRecipe),
    dep("seed", seedRootRecipe),
    dep("source", patchSourceRecipe),
  ],
});

await importToStore(recipe);
export const patchRecipe = recipe;
