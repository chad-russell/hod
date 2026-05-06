//! run-packed-hello recipe — validates the packed executable binary.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { hodSeedRootRecipe } from "../bootstrap/hod-seed-root.js";
import { helloPackedRecipe } from "./hello-packed.js";

const preamble = hermeticPreamble({ shell: "seed", muslLinker: "seed" });

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

${preamble}

# Run the packed binary. The AT_EXECFN bootstrap finds the linker
# relative to the binary's own path, and RPATH=$ORIGIN/../lib tells
# the linker where to find shared libraries.
/deps/packed/bin/binary > $OUT/output.txt 2>&1

echo "Packed binary executed successfully" >> $OUT/output.txt`,
  ],
  dependencies: [
    dep("packed", helloPackedRecipe),
    dep("seed", hodSeedRootRecipe),
  ],
});

await importToStore(recipe);
export const runPackedHelloRecipe = recipe;
