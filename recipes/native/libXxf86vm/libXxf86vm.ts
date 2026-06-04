//! libXxf86vm — XFree86-VidMode X extension library.
//!
//! Needed by Mesa for GLX support. Small autotools build.
//! Depends on libX11 and xorgproto.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { libX11Recipe } from "../libX11/libX11.js";
import { libXauRecipe } from "../libXau/libXau.js";
import { libXcbRecipe } from "../libxcb/libxcb.js";
import { libXdmcpRecipe } from "../libXdmcp/libXdmcp.js";
import { libXxf86vmSourceRecipe } from "./libXxf86vm-source.js";
import { libXextRecipe } from "../libXext/libXext.js";
import { cProfile } from "../../helpers/c.js";
import { RELOCATE_PKG_CONFIG, STRIP_LIBRARIES } from "../../helpers/strip.js";

export const libXxf86vmRuntimeDeps = ["libX11", "libXau", "libXcb", "libXdmcp", "libXext", "toolchain"];

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["xorgproto", "libX11", "libXau", "libXcb", "libXdmcp", "libXext"],
    libDeps: ["libX11", "libXau", "libXcb", "libXdmcp", "libXext"],
    pkgConfigDeps: ["libX11", "libXau", "libXcb", "libXdmcp", "libXext"],
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
    dep("source", libXxf86vmSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("xorgproto", xorgprotoRecipe),
    dep("libX11", libX11Recipe),
    dep("libXau", libXauRecipe),
    dep("libXcb", libXcbRecipe),
    dep("libXdmcp", libXdmcpRecipe),
    dep("libXext", libXextRecipe),
  ],
  runtime_deps: libXxf86vmRuntimeDeps,
});

await importToStore(recipe);
export const libXxf86vmRecipe = recipe;
