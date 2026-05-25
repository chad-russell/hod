//! xcb-util-renderutil build recipe — XCB render extension helpers.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { cProfile } from "../../helpers/c.js";
import { xcbUtilRenderutilSourceRecipe } from "./xcb-util-renderutil-source.js";
import { libXcbRecipe, libXcbRuntimeDeps } from "../libxcb/libxcb.js";
import { libXauRecipe } from "../libXau/libXau.js";
import { libXdmcpRecipe } from "../libXdmcp/libXdmcp.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";

export const xcbUtilRenderutilRuntimeDeps = ["libXau", "libXcb", "libXdmcp", "toolchain"];

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["libXau", "libXcb", "libXdmcp", "xorgproto"],
    libDeps: ["libXau", "libXcb", "libXdmcp"],
    pkgConfigDeps: ["libXau", "libXcb", "libXdmcp", "xorgproto"],
  }),
  script: `
cp -a /deps/source/. /tmp/build
cd /tmp/build

./configure --prefix=/ --enable-shared --disable-static
make -j$(nproc)
make install DESTDIR=$OUT

for pc in $OUT/lib/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*)   sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
  esac
done

find $OUT/lib -name '*.so*' -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true
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
