//! bison shim build recipe.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { seedRootRecipe } from "../bootstrap/seed-root.js";
import { m4Recipe } from "./m4.js";
import { bisonSourceRecipe } from "./bison-source.js";
// Phantom shims dependency — no corresponding .hod file on disk.
// This was an earlier version of the shims bundle that has been replaced.
const PHANTOM_SHIMS_HASH = "20c565286533f188744496503328b9d04dda2958e27573ef3ffa3900a6e53717";

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
    dep("seed", seedRootRecipe),
    dep("shims", PHANTOM_SHIMS_HASH),
    dep("source", bisonSourceRecipe),
  ],
});

await importToStore(recipe);
export const bisonRecipe = recipe;
