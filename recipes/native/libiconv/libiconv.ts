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

const recipe = await shellBuild({
  ...cProfile(),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

# Configure: shared + static, no NLS, no docs
./configure \\
  --prefix=/ \\
  --enable-shared \\
  --enable-static \\
  --disable-nls \\
  --disable-dependency-tracking

make -j$(nproc)
make install DESTDIR=$OUT

# Strip the iconv binary and shared library
/deps/toolchain/bin/strip $OUT/bin/iconv 2>/dev/null || true
/deps/toolchain/bin/strip $OUT/lib/libiconv.so.*.*.* $OUT/lib/libcharset.so.*.*.* 2>/dev/null || true

# Clean up — remove docs, man pages, la files, charset.alias
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/lib/*.la $OUT/lib/charset.alias 2>/dev/null || true
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
