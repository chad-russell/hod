//! unzip native build recipe — Info-ZIP archive extraction tools.
//!
//! Builds UnZip 6.0 from source using the upstream Unix Makefile. The output
//! provides `unzip`, `zipinfo`, `funzip`, `unzipsfx`, and `zipgrep`.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_BINARIES } from "../../helpers/strip.js";
import { unzipSourceRecipe } from "./unzip-source.js";

const recipe = await shellBuild({
  ...cProfile(),
  sourceDir: true,
  script: `

# Info-ZIP's Unix Makefile does not support DESTDIR. Install directly into
# the staging prefix and then remove man pages to keep the profile lean.
make -f unix/Makefile flags \\
  CC="$CC" \\
  CF="$CFLAGS -I. -DUNIX"

eval make -f unix/Makefile -j$(nproc) unzips \\
  ACONF_DEP=flags \\
  $(cat flags) \\
  CC='"$CC"' \\
  LD='"$CC"' \\
  LFLAGS1='"$LDFLAGS"' \\
  LF2='""' \\
  SL2='""' \\
  FL2='""'

make -f unix/Makefile install prefix="$OUT"

${STRIP_BINARIES}
rm -rf $OUT/man $OUT/share/man $OUT/share/doc 2>/dev/null || true
`,
  deps: [
    dep("source", unzipSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const unzipRecipe = recipe;
