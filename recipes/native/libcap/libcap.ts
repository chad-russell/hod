//! libcap native build recipe — POSIX.1e capabilities library.
//!
//! Builds libcap 2.78 with shared library output. No dependencies beyond
//! the toolchain. Provides libcap.so needed by crun (OCI runtime) and
//! bubblewrap (Flatpak sandboxing).

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libcapSourceRecipe } from "./libcap-source.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile(),
  sourceDir: true,
  script: `
make -j$(nproc) CC="$CC" -C libcap lib=lib PAM_CAP=no GOLANG=no
make install CC="$CC" -C libcap lib=lib PAM_CAP=no GOLANG=no RAISE_SETFCAP=no DESTDIR=$OUT prefix=/

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
rm -rf $OUT/share/man 2>/dev/null || true
`,
  deps: [
    dep("source", libcapSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const libcapRecipe = recipe;
