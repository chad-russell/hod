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

export PATH=/deps/make/bin:/deps/seed/bin:$PATH

tar xf /deps/source/source -C /tmp
cd /tmp/bison-*

CC=/deps/seed/bin/gcc \\
AR=/deps/seed/bin/ar \\
RANLIB=/deps/seed/bin/ranlib \\
CFLAGS="-O2" \\
LDFLAGS="-static" \\
./configure --prefix=/ --disable-dependency-tracking

make -j$(nproc)
make install DESTDIR=$OUT

# Remove unnecessary files
rm -rf $OUT/share/info $OUT/share/man $Out/share/doc`,
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
