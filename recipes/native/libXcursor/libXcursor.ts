//! libXcursor build recipe — X cursor management library.
//!
//! Builds libXcursor 1.2.2. Part of the GTK3 X11 extension stack.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { libXcursorSourceRecipe } from "./libXcursor-source.js";
import { libX11Recipe } from "../libX11/libX11.js";
import { libXrenderRecipe } from "../libXrender/libXrender.js";
import { libXfixesRecipe } from "../libXfixes/libXfixes.js";
import { libXauRecipe } from "../libXau/libXau.js";
import { libXcbRecipe } from "../libxcb/libxcb.js";
import { libXdmcpRecipe } from "../libXdmcp/libXdmcp.js";
import { cProfile } from "../../helpers/c.js";
import { RELOCATE_PKG_CONFIG, STRIP_LIBRARIES } from "../../helpers/strip.js";

export const libXcursorRuntimeDeps = ["libX11", "libXau", "libXcb", "libXdmcp", "libXfixes", "libXrender", "toolchain"];

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["xorgproto", "libX11", "libXrender", "libXfixes", "libXau", "libXcb", "libXdmcp"],
    libDeps: ["libX11", "libXrender", "libXfixes", "libXau", "libXcb", "libXdmcp"],
    pkgConfigDeps: ["libX11", "libXrender", "libXfixes", "libXau", "libXcb", "libXdmcp"],
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
    dep("source", libXcursorSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("xorgproto", xorgprotoRecipe),
    dep("libX11", libX11Recipe),
    dep("libXrender", libXrenderRecipe),
    dep("libXfixes", libXfixesRecipe),
    dep("libXau", libXauRecipe),
    dep("libXcb", libXcbRecipe),
    dep("libXdmcp", libXdmcpRecipe),
  ],
  runtime_deps: libXcursorRuntimeDeps,
});

await importToStore(recipe);
export const libXcursorRecipe = recipe;
