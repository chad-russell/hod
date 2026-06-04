//! pcre2 native build recipe — Perl-compatible regular expression library.
//!
//! Builds PCRE2 10.47. Standalone autotools build, zero deps beyond
//! toolchain. Produces libpcre2-8.so and pcre2grep CLI.
//!
//! Dynamically links glibc (relocated via runtime_deps).

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { pcre2SourceRecipe } from "./pcre2-source.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile(),
  sourceDir: true,
  script: `

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --disable-dependency-tracking \\
  --enable-pcre2-8 \\
  --disable-pcre2-16 \\
  --disable-pcre2-32 \\
  --disable-dependency-tracking

make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
rm -rf $OUT/share/info 2>/dev/null || true

# Verify key outputs
ls -la $OUT/bin/pcre2grep
ls -la $OUT/lib/libpcre2-8.so
ls -la $OUT/lib/pkgconfig/libpcre2-8.pc
`,
  deps: [
    dep("source", pcre2SourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const pcre2Recipe = recipe;
