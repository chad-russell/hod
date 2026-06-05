//! pyparsing build recipe — Python parsing library.
//!
//! Installs pyparsing 3.3.2 as a pure-Python package. No compilation needed —
//! just copies the pyparsing module tree into a site-packages output directory.
//! Required by flatpak's build for bison-generated parser post-processing.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { pyparsingSourceRecipe } from "./pyparsing-source.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile(),
  sourceDir: true,
  script: `
mkdir -p $OUT/lib/python3/site-packages
cp -a pyparsing $OUT/lib/python3/site-packages/
`,
  deps: [
    dep("source", pyparsingSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
});

await importToStore(recipe);
export const pyparsingRecipe = recipe;
