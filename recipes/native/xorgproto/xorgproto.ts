//! xorgproto build recipe — X Window System unified protocol headers.
//!
//! Builds xorgproto 2024.1. Headers-only package (no library).

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { xorgprotoSourceRecipe } from "./xorgproto-source.js";
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
    dep("source", xorgprotoSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
});

await importToStore(recipe);
export const xorgprotoRecipe = recipe;
