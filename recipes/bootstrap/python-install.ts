//! python-install bootstrap recipe — installs python from the standalone archive.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { pythonRecipe } from "./python.js";
import { seedRootRecipe } from "./seed-root.js";

const preamble = hermeticPreamble({ shell: "seed" });

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

${preamble}

mkdir -p $OUT/bin $OUT/lib $OUT/include $OUT/share

cp -a /deps/python-archive/python/bin/* $OUT/bin/
cp -a /deps/python-archive/python/lib/* $OUT/lib/
cp -a /deps/python-archive/python/include/* $OUT/include/
test -d /deps/python-archive/python/share && cp -a /deps/python-archive/python/share/* $OUT/share/ || true

chmod +x $OUT/bin/python3 $OUT/bin/python3.12 $OUT/bin/python`,
  ],
  dependencies: [
    dep("python-archive", pythonRecipe),
    dep("seed", seedRootRecipe),
  ],
});

await importToStore(recipe);
export const pythonInstallRecipe = recipe;
