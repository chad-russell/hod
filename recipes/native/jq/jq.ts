//! jq native build recipe — command-line JSON processor.
//!
//! Builds jq 1.8.1 with its bundled oniguruma regex library. Standard autotools
//! build. The bundled oniguruma is built as a static lib and linked into the jq
//! binary. Produces jq (CLI) and libjq.so (shared library for programmatic use).
//!
//! The bundled oniguruma configure tries to run test programs to determine type
//! sizes, which fails in the hermetic sandbox. We pre-seed autoconf cache values
//! for the vendor/oniguruma subdirectory as well.
//!
//! Dependencies: toolchain only (bundled oniguruma, no external deps).
//!
//! Output provides: jq, libjq.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { jqSourceRecipe } from "./jq-source.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile(),
  sourceDir: true,
  script: `
# Pre-seed autoconf cache for the bundled oniguruma configure.
# It can't run test programs in the hermetic sandbox to determine type sizes.
cat > config.cache <<'EOF'
ac_cv_sizeof_int=4
ac_cv_sizeof_long=8
ac_cv_sizeof_long_long=8
ac_cv_sizeof_short=2
ac_cv_sizeof_voidp=8
EOF

# Also pre-seed cache for vendor/oniguruma subdirectory
cp config.cache vendor/oniguruma/config.cache

./configure \\
  --prefix=/ \\
  -C \\
  --disable-static \\
  --enable-shared \\
  --with-oniguruma=builtin \\
  --disable-maintainer-mode

make -j$(nproc)
make install DESTDIR=$OUT

${STRIP_ALL}
rm -rf $OUT/share/info 2>/dev/null || true
find $OUT/share -type d -empty -delete 2>/dev/null || true
`,
  deps: [
    dep("source", jqSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const jqRecipe = recipe;
