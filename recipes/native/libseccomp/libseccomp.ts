//! libseccomp build recipe — high-level interface to Linux seccomp syscall filtering.
//!
//! Builds libseccomp 2.5.5. No external dependencies beyond the toolchain.
//! Required by gnome-desktop-4.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libseccompSourceRecipe } from "./libseccomp-source.js";
import { gperfRecipe } from "../gperf/gperf.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const libseccompRuntimeDeps = ["toolchain"];

const recipe = await shellBuild({
  ...cProfile({
    binDeps: ["gperf"],
  }),
  sourceDir: true,
  script: `
./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --disable-python

make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", libseccompSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("gperf", gperfRecipe),
  ],
  runtime_deps: libseccompRuntimeDeps,
});

await importToStore(recipe);
export const libseccompRecipe = recipe;
