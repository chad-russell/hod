//! validate-seed bootstrap recipe — verifies the seed toolchain can compile a C program.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { hodSeedRootRecipe } from "./hod-seed-root.js";

const preamble = hermeticPreamble({ shell: "seed", muslLinker: "seed" });

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

${preamble}

echo 'int main(){return 0;}' > /tmp/test.c
/deps/seed/bin/gcc -o /tmp/test /tmp/test.c
cp /tmp/test $OUT/hello
echo 'seed-gcc compiled successfully' > $OUT/result.txt`,
  ],
  dependencies: [
    dep("seed", hodSeedRootRecipe),
  ],
});

await importToStore(recipe);
export const validateSeedRecipe = recipe;
