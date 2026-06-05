//! libksba build recipe — X.509 and CMS library.
//!
//! Builds libksba 1.8.0. Provides certificate parsing, CMS (PKCS#7),
//! and OCSP handling. Required by gnupg for S/MIME and key management.
//!
//! Dependencies:
//!   - libgpg-error (common error codes)

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libksbaSourceRecipe } from "./libksba-source.js";
import { libgpgErrorRecipe } from "../libgpg-error/libgpg-error.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const libksbaRuntimeDeps = ["libgpg-error", "toolchain"];

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
rm -rf $OUT/share/man $OUT/share/info
`,
  deps: [
    dep("source", libksbaSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("libgpg-error", libgpgErrorRecipe),
  ],
  runtime_deps: libksbaRuntimeDeps,
});

await importToStore(recipe);
export const libksbaRecipe = recipe;
