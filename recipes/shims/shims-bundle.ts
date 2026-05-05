//! shims-bundle recipe — bundles all shim tools into a single directory.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { seedRootRecipe } from "../bootstrap/seed-root.js";
import { bisonRecipe } from "./bison.js";
import { gawkRecipe } from "./gawk.js";
import { m4Recipe } from "./m4.js";
import { makeRecipe } from "./make.js";
import { patchRecipe } from "./patch.js";
import { sedRecipe } from "./sed.js";

const preamble = hermeticPreamble({ shell: "seed" });

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

${preamble}

mkdir -p $OUT/bin $OUT/share

cp /deps/bison/bin/bison $OUT/bin/
cp -a /deps/bison/share/bison $OUT/share/
cp /deps/gawk/bin/gawk $OUT/bin/
ln -sf gawk $OUT/bin/awk
cp /deps/m4/bin/m4 $OUT/bin/
cp /deps/make/bin/make $OUT/bin/
cp /deps/patch/bin/patch $OUT/bin/
cp /deps/sed/bin/sed $OUT/bin/

chmod +x $OUT/bin/*`,
  ],
  dependencies: [
    dep("bison", bisonRecipe),
    dep("gawk", gawkRecipe),
    dep("m4", m4Recipe),
    dep("make", makeRecipe),
    dep("patch", patchRecipe),
    dep("sed", sedRecipe),
    dep("seed", seedRootRecipe),
  ],
});

await importToStore(recipe);
export const shimsBundleRecipe = recipe;
