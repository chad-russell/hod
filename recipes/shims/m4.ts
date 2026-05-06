//! m4 shim build recipe.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { seedRootRecipe } from "../bootstrap/seed-root.js";
import { m4SourceRecipe } from "./m4-source.js";
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

export PATH=/deps/make/bin:/deps/seed/bin:$PATH

tar xf /deps/source/source -C /tmp
cd /tmp/m4-*

CC=/deps/seed/bin/gcc \\
AR=/deps/seed/bin/ar \\
RANLIB=/deps/seed/bin/ranlib \\
CFLAGS="-O2" \\
LDFLAGS="-static" \\
./configure --prefix=/ --disable-dependency-tracking

make -j$(nproc)

mkdir -p $OUT/bin
cp src/m4 $OUT/bin/m4
chmod +x $OUT/bin/m4`,
  ],
  dependencies: [
    dep("make", makeRecipe),
    dep("seed", seedRootRecipe),
    dep("source", m4SourceRecipe),
  ],
});

await importToStore(recipe);
export const m4Recipe = recipe;
