//! debug recipe — inspects deps layout for ncurses source.
import { process, dep, importToStore, hermeticPreamble } from "../../../js/src/index.js";
import { hodSeedRootRecipe } from "../../bootstrap/hod-seed-root.js";
import { ncursesSourceRecipe } from "./ncurses-source.js";

const preamble = hermeticPreamble({ shell: "seed", muslLinker: "seed" });

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

${preamble}

echo "=== DEBUG: checking deps layout ==="
ls -la /deps/
echo "---"
ls -la /deps/source/
echo "---"
ls -la /store/
echo "---"
file /deps/source/source || echo 'file cmd not available'
echo "---"

mkdir -p /tmp/ncurses
tar xzf /deps/source/source -C /tmp/ncurses
ls -la /tmp/ncurses/ncurses-6.6/configure
./tmp/ncurses-6.6/configure --help | head -3

echo done > $OUT/test.txt`,
  ],
  env: { PATH: "/deps/seed/bin" },
  dependencies: [
    dep("seed", hodSeedRootRecipe),
    dep("source", ncursesSourceRecipe),
  ],
});

await importToStore(recipe);
export const debugRecipe = recipe;
