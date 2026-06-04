//! passt native build recipe — user-mode networking for containers.
//!
//! Builds passt/pasta which provides rootless networking for podman.
//! pasta is the namespace/tap mode used by rootless podman.
//! Pure C project with no library dependencies beyond kernel headers.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { passtSourceRecipe } from "./passt-source.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile(),
  sourceDir: true,
  script: `
make -j$(nproc) CC="$CC" VERSION="2026_05_26" CFLAGS="-O2 -DPAGE_SIZE=4096"
make install DESTDIR=$OUT prefix=/

# Only need pasta for rootless podman — remove AVX2 variants and extras
rm -f $OUT/bin/passt.avx2 $OUT/bin/pasta.avx2 $OUT/bin/qrap 2>/dev/null || true
rm -rf $OUT/share/man 2>/dev/null || true
rmdir $OUT/share 2>/dev/null || true
`,
  deps: [
    dep("source", passtSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const passtRecipe = recipe;
