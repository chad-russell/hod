//! libiconv native build recipe — GNU character encoding conversion library.
//!
//! Builds GNU libiconv 1.19 with shared + static library output, iconv.h,
//! and the iconv command-line tool. libiconv provides the iconv() API for
//! converting between character encodings. It is needed by git, many GNU
//! packages, and software that handles international text.
//!
//! No dependencies beyond the toolchain. Standard autotools build.
//! Dynamically links glibc from the toolchain (relocated via runtime_deps).

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libiconvSourceRecipe } from "./libiconv-source.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile(),
  sourceDir: true,
  script: `
# Configure: shared + static, no NLS, no docs
./configure \\
  --prefix=/ \\
  --enable-shared \\
  --enable-static \\
  --disable-nls \\
  --disable-dependency-tracking

make -j$(nproc)
make install DESTDIR=$OUT

${STRIP_ALL}
rm -rf $OUT/share/info $OUT/lib/charset.alias 2>/dev/null || true
rmdir $OUT/share 2>/dev/null || true
`,
  deps: [
    dep("source", libiconvSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const libiconvRecipe = recipe;
