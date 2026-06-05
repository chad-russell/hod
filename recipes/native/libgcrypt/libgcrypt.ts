//! libgcrypt build recipe — general-purpose cryptographic library.
//!
//! Builds libgcrypt 1.12.2. Provides symmetric encryption, hashing,
//! public-key crypto, and random number generation. Required by gnupg.
//!
//! Dependencies:
//!   - libgpg-error (common error codes)

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libgcryptSourceRecipe } from "./libgcrypt-source.js";
import { libgpgErrorRecipe } from "../libgpg-error/libgpg-error.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const libgcryptRuntimeDeps = ["libgpg-error", "toolchain"];

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["libgpg-error"],
    libDeps: ["libgpg-error"],
    pkgConfigDeps: ["libgpg-error"],
  }),
  sourceDir: true,
  script: `
export PATH=/deps/libgpg-error/bin:$PATH

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --disable-nls \\
  --disable-doc

make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
rm -rf $OUT/share/man $OUT/share/info $OUT/share/doc
`,
  deps: [
    dep("source", libgcryptSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("libgpg-error", libgpgErrorRecipe),
  ],
  runtime_deps: libgcryptRuntimeDeps,
});

await importToStore(recipe);
export const libgcryptRecipe = recipe;
