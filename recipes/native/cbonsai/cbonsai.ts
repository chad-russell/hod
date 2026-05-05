//! cbonsai native build recipe.
import { process, dep, importToStore, hermeticPreamble } from "../../../js/src/index.js";
import { seedRootRecipe } from "../../bootstrap/seed-root.js";
import { ncursesRecipe } from "../ncurses/ncurses.js";
import { cbonsaiSourceRecipe } from "./cbonsai-source.js";

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
cd /tmp/cbonsai-v1.4.2

# Build cbonsai — single C file, needs ncursesw
# We skip pkg-config and pass flags directly since we have a static ncurses
CC=/deps/seed/bin/gcc \\
CFLAGS="-O2 -I/deps/ncurses/include -I/deps/ncurses/include/ncursesw" \\
LDFLAGS="-static -L/deps/ncurses/lib" \\
make cbonsai LDLIBS="-lncursesw -ltinfo -lpanelw"

mkdir -p $OUT/bin
cp cbonsai $OUT/bin/cbonsai
chmod +x $OUT/bin/cbonsai`,
  ],
  env: { PATH: "/deps/seed/bin" },
  dependencies: [
    dep("ncurses", ncursesRecipe),
    dep("seed", seedRootRecipe),
    dep("source", cbonsaiSourceRecipe),
  ],
});

await importToStore(recipe);
export const cbonsaiRecipe = recipe;
