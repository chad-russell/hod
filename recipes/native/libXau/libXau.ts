//! libXau build recipe — X Authorization library.
//!
//! Builds libXau 1.0.12. Tiny library for X11 authorization.
//! Shared library. runtime_deps exported for downstream use.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libXauSourceRecipe } from "./libXau-source.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { cProfile } from "../../helpers/c.js";
import { RELOCATE_PKG_CONFIG, STRIP_LIBRARIES } from "../../helpers/strip.js";

export const libXauRuntimeDeps = ["toolchain"];

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["xorgproto"],
    // TODO: pkgConfigPaths no longer needed — cProfile() now auto-includes
    // both lib/pkgconfig and share/pkgconfig for each pkgConfigDeps entry.
    // Add "xorgproto" to pkgConfigDeps and remove this pkgConfigPaths block.
    pkgConfigPaths: ["/deps/xorgproto/share/pkgconfig"],
  }),
  sourceDir: true,
  script: `
./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static

make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

# Strip shared library
${STRIP_LIBRARIES}

# Clean up
rm -rf $OUT/share/doc $OUT/share/man $OUT/lib/*.la 2>/dev/null || true
`,
  deps: [
    dep("source", libXauSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("xorgproto", xorgprotoRecipe),
  ],
  runtime_deps: libXauRuntimeDeps,
});

await importToStore(recipe);
export const libXauRecipe = recipe;
