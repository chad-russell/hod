//! libXcomposite build recipe — X Composite extension library.
//!
//! Builds libXcomposite 0.4.6. Part of the GTK3 X11 extension stack.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { libXcompositeSourceRecipe } from "./libXcomposite-source.js";
import { libX11Recipe } from "../libX11/libX11.js";
import { libXfixesRecipe } from "../libXfixes/libXfixes.js";
import { libXauRecipe } from "../libXau/libXau.js";
import { libXcbRecipe } from "../libxcb/libxcb.js";
import { libXdmcpRecipe } from "../libXdmcp/libXdmcp.js";
import { cProfile } from "../../helpers/c.js";
import { RELOCATE_PKG_CONFIG, STRIP_LIBRARIES } from "../../helpers/strip.js";

export const libXcompositeRuntimeDeps = ["libX11", "libXau", "libXcb", "libXdmcp", "libXfixes", "toolchain"];

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["xorgproto", "libX11", "libXfixes", "libXau", "libXcb", "libXdmcp"],
    libDeps: ["libX11", "libXfixes", "libXau", "libXcb", "libXdmcp"],
    pkgConfigDeps: ["libX11", "libXfixes", "libXau", "libXcb", "libXdmcp"],
    // TODO: pkgConfigPaths no longer needed — cProfile() now auto-includes
    // both lib/pkgconfig and share/pkgconfig for each pkgConfigDeps entry.
    // Add "xorgproto" to pkgConfigDeps and remove this pkgConfigPaths block.
    pkgConfigPaths: ["/deps/xorgproto/share/pkgconfig"],
  }),
  sourceDir: true,
  script: `
./configure \
  --prefix=/ \
  --enable-shared \
  --disable-static

make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

${STRIP_LIBRARIES}
rm -rf $OUT/share/doc $OUT/share/man $OUT/lib/*.la 2>/dev/null || true
`,
  deps: [
    dep("source", libXcompositeSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("xorgproto", xorgprotoRecipe),
    dep("libX11", libX11Recipe),
    dep("libXfixes", libXfixesRecipe),
    dep("libXau", libXauRecipe),
    dep("libXcb", libXcbRecipe),
    dep("libXdmcp", libXdmcpRecipe),
  ],
  runtime_deps: libXcompositeRuntimeDeps,
});

await importToStore(recipe);
export const libXcompositeRecipe = recipe;
