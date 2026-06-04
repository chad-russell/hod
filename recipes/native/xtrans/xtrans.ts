//! xtrans build recipe — X transport library headers.
//!
//! Builds xtrans 1.6.0. Header/data package used by libX11.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { xtransSourceRecipe } from "./xtrans-source.js";
import { cProfile } from "../../helpers/c.js";
import { RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile(),
  sourceDir: true,
  script: `

./configure --prefix=/
make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

rm -rf $OUT/share/doc $OUT/share/man $OUT/lib/*.la 2>/dev/null || true
`,
  deps: [
    dep("source", xtransSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
});

await importToStore(recipe);
export const xtransRecipe = recipe;
