//! lsof native build recipe — list open files.
//!
//! Builds lsof 4.99.6 with autotools. Links against glibc from the toolchain
//! (relocated via runtime_deps).
//!
//! Output provides: lsof — a utility listing information about files opened
//! by running processes.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { lsofSourceRecipe } from "./lsof-source.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_BINARIES } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile(),
  sourceDir: true,
  script: `

./configure \
  --prefix=/ \
  --disable-nls

printf '#!/bin/sh\ncat' > soelim && chmod +x soelim
PATH="$(pwd):$PATH" make -j$(nproc)
make install DESTDIR=$OUT

${STRIP_BINARIES}
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info 2>/dev/null || true
`,
  deps: [
    dep("source", lsofSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const lsofRecipe = recipe;
