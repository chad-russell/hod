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

export const xcbUtilImageRuntimeDeps = ["libXau", "libXcb", "libXdmcp", "toolchain", "xcb-util"];

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["libXau", "libXcb", "libXdmcp", "xcb-util", "xorgproto"],
    libDeps: ["libXau", "libXcb", "libXdmcp", "xcb-util"],
    pkgConfigDeps: ["libXau", "libXcb", "libXdmcp", "xcb-util", "xorgproto"],
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
