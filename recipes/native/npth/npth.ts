//! npth build recipe — GNU portable threads library.
//!
//! Builds npth 1.8. Provides a POSIX threads emulation layer used by
//! gnupg for cooperative threading. Required by gnupg.
//!
//! Dependencies:
//!   - libgpg-error (common error codes)

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { npthSourceRecipe } from "./npth-source.js";
import { libgpgErrorRecipe } from "../libgpg-error/libgpg-error.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const npthRuntimeDeps = ["libgpg-error", "toolchain"];

const recipe = await shellBuild({
  ...cProfile({
    pkgConfigDeps: ["libgpg-error"],
  }),
  sourceDir: true,
  script: `
export PATH=/deps/libgpg-error/bin:$PATH

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --disable-nls

make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
rm -rf $OUT/share/man $OUT/share/info
`,
  deps: [
    dep("source", npthSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("libgpg-error", libgpgErrorRecipe),
  ],
  runtime_deps: npthRuntimeDeps,
});

await importToStore(recipe);
export const npthRecipe = recipe;
