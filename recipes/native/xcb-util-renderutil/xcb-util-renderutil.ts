//! xcb-util-renderutil build recipe — XCB render extension helpers.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { cProfile } from "../../helpers/c.js";
import { xcbUtilRenderutilSourceRecipe } from "./xcb-util-renderutil-source.js";
import { libXcbRecipe, libXcbRuntimeDeps } from "../libxcb/libxcb.js";
import { libXauRecipe } from "../libXau/libXau.js";
import { libXdmcpRecipe } from "../libXdmcp/libXdmcp.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { STRIP_LIBRARIES, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const xcbUtilRenderutilRuntimeDeps = ["libXau", "libXcb", "libXdmcp", "toolchain"];

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["libXau", "libXcb", "libXdmcp", "xorgproto"],
    libDeps: ["libXau", "libXcb", "libXdmcp"],
    pkgConfigDeps: ["libXau", "libXcb", "libXdmcp", "xorgproto"],
  }),
  sourceDir: true,
  script: `

./configure --prefix=/ --enable-shared --disable-static
make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

${STRIP_LIBRARIES}
rm -rf $OUT/share/doc $OUT/share/man $OUT/lib/*.la 2>/dev/null || true
`,
  deps: [
    dep("source", xcbUtilRenderutilSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("libXau", libXauRecipe),
    dep("libXcb", libXcbRecipe),
    dep("libXdmcp", libXdmcpRecipe),
    dep("xorgproto", xorgprotoRecipe),
  ],
  runtime_deps: xcbUtilRenderutilRuntimeDeps,
});

await importToStore(recipe);
export const xcbUtilRenderutilRecipe = recipe;
