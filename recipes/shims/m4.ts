//! m4 shim build recipe.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { seedRootRecipe } from "../bootstrap/seed-root.js";
import { m4SourceRecipe } from "./m4-source.js";
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
    dep("seed", seedRootRecipe),
    dep("shims", PHANTOM_SHIMS_HASH),
    dep("source", m4SourceRecipe),
  ],
});

await importToStore(recipe);
export const m4Recipe = recipe;
