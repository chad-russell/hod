//! nghttp2 build recipe — HTTP/2 C library.
//!
//! Builds nghttp2 1.69.0 (library only, no command-line tools).
//! Dependencies: toolchain only. Required by libsoup3.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { nghttp2SourceRecipe } from "./nghttp2-source.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile({ cxx: true }),
  sourceDir: true,
  script: `
# Build only the library, not the full application suite
./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --enable-lib-only \\
  --disable-python-bindings \\
  --disable-examples \\
  --disable-app \\
  --disable-hpack-tools \\
  --disable-assert \\
  --without-jemalloc \\
  --without-libxml2 \\
  --without-neverbleed

make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", nghttp2SourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const nghttp2Recipe = recipe;
