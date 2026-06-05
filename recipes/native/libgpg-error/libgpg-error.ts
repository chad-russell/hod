//! libgpg-error build recipe — common error codes for GnuPG components.
//!
//! Builds libgpg-error 1.54. Provides libgpg-error.so, gpg-error-config,
//! and gpgrt-config. Required by libassuan and gpgme.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libgpgErrorSourceRecipe } from "./libgpg-error-source.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const libgpgErrorRuntimeDeps = ["toolchain"];

const recipe = await shellBuild({
  ...cProfile(),
  sourceDir: true,
  script: `
./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --disable-nls \\
  --disable-languages

make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
rm -rf $OUT/share/man $OUT/share/info
`,
  deps: [
    dep("source", libgpgErrorSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: libgpgErrorRuntimeDeps,
});

await importToStore(recipe);
export const libgpgErrorRecipe = recipe;
