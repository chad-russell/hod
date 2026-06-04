//! xcb-util-image build recipe — XCB image helpers.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { cProfile } from "../../helpers/c.js";
import { xcbUtilImageSourceRecipe } from "./xcb-util-image-source.js";
import { libXcbRecipe } from "../libxcb/libxcb.js";
import { libXauRecipe } from "../libXau/libXau.js";
import { libXdmcpRecipe } from "../libXdmcp/libXdmcp.js";
import { xcbUtilRecipe, xcbUtilRuntimeDeps } from "../xcb-util/xcb-util.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { STRIP_LIBRARIES, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const xcbUtilImageRuntimeDeps = ["libXau", "libXcb", "libXdmcp", "toolchain", "xcb-util"];

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["libXau", "libXcb", "libXdmcp", "xcb-util", "xorgproto"],
    libDeps: ["libXau", "libXcb", "libXdmcp", "xcb-util"],
    pkgConfigDeps: ["libXau", "libXcb", "libXdmcp", "xcb-util", "xorgproto"],
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
    dep("source", xcbUtilImageSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("libXau", libXauRecipe),
    dep("libXcb", libXcbRecipe),
    dep("libXdmcp", libXdmcpRecipe),
    dep("xcb-util", xcbUtilRecipe),
    dep("xorgproto", xorgprotoRecipe),
  ],
  runtime_deps: xcbUtilImageRuntimeDeps,
});

await importToStore(recipe);
export const xcbUtilImageRecipe = recipe;
