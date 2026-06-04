//! xcb-util-cursor build recipe — XCB cursor helpers.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { cProfile } from "../../helpers/c.js";
import { xcbUtilCursorSourceRecipe } from "./xcb-util-cursor-source.js";
import { libXcbRecipe } from "../libxcb/libxcb.js";
import { libXauRecipe } from "../libXau/libXau.js";
import { libXdmcpRecipe } from "../libXdmcp/libXdmcp.js";
import { xcbUtilImageRecipe } from "../xcb-util-image/xcb-util-image.js";
import { xcbUtilRenderutilRecipe } from "../xcb-util-renderutil/xcb-util-renderutil.js";
import { xcbUtilRecipe } from "../xcb-util/xcb-util.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { m4Recipe } from "../m4/m4.js";
import { STRIP_LIBRARIES, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const xcbUtilCursorRuntimeDeps = [
  "libXau",
  "libXcb",
  "libXdmcp",
  "toolchain",
  "xcb-util",
  "xcb-util-image",
  "xcb-util-renderutil",
];

const recipe = await shellBuild({
  ...cProfile({
    binDeps: ["m4"],
    includeDeps: ["libXau", "libXcb", "libXdmcp", "xcb-util-image", "xcb-util-renderutil", "xorgproto"],
    libDeps: ["libXau", "libXcb", "libXdmcp", "xcb-util-image", "xcb-util-renderutil"],
    pkgConfigDeps: ["libXau", "libXcb", "libXdmcp", "xcb-util-image", "xcb-util-renderutil", "xorgproto"],
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
    dep("source", xcbUtilCursorSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("m4", m4Recipe),
    dep("libXau", libXauRecipe),
    dep("libXcb", libXcbRecipe),
    dep("libXdmcp", libXdmcpRecipe),
    dep("xcb-util", xcbUtilRecipe),
    dep("xcb-util-image", xcbUtilImageRecipe),
    dep("xcb-util-renderutil", xcbUtilRenderutilRecipe),
    dep("xorgproto", xorgprotoRecipe),
  ],
  runtime_deps: xcbUtilCursorRuntimeDeps,
});

await importToStore(recipe);
export const xcbUtilCursorRecipe = recipe;
