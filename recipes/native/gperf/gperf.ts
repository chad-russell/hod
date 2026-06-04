//! gperf build recipe — perfect hash function generator.
//!
//! Build tool needed by fontconfig.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { gperfSourceRecipe } from "./gperf-source.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile({ cxx: true }),
  sourceDir: true,
  script: `
./configure \
  --prefix=/ \
  --disable-dependency-tracking

make -j$(nproc)
make install DESTDIR=$OUT

${STRIP_ALL}
rm -rf $OUT/share/info 2>/dev/null || true
`,
  deps: [
    dep("source", gperfSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const gperfRecipe = recipe;
