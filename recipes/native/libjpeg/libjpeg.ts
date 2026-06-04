//! libjpeg (IJG) build recipe — JPEG image compression library.
//!
//! Builds IJG libjpeg 9e. No external dependencies beyond the toolchain.
//! Required by gdk-pixbuf (JPEG loader) and GTK4.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libjpegSourceRecipe } from "./libjpeg-source.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL } from "../../helpers/strip.js";

export const libjpegRuntimeDeps = ["toolchain"];

const recipe = await shellBuild({
  ...cProfile(),
  sourceDir: true,
  script: `
./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static

make -j$(nproc)
make install DESTDIR=$OUT

${STRIP_ALL}
`,
  deps: [
    dep("source", libjpegSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: libjpegRuntimeDeps,
});

await importToStore(recipe);
export const libjpegRecipe = recipe;
