//! libXtst build recipe — X Test extension library.
//!
//! Builds libXtst 1.2.5. Provides Xtst extension for X11 testing/input synthesis.
//! Required by at-spi2-core for accessibility X11 support.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libXtstSourceRecipe } from "./libXtst-source.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { libX11Recipe } from "../libX11/libX11.js";
import { libXextRecipe } from "../libXext/libXext.js";
import { libXauRecipe } from "../libXau/libXau.js";
import { libXcbRecipe } from "../libxcb/libxcb.js";
import { libXdmcpRecipe } from "../libXdmcp/libXdmcp.js";
import { libXiRecipe } from "../libXi/libXi.js";
import { libXfixesRecipe } from "../libXfixes/libXfixes.js";
import { cProfile } from "../../helpers/c.js";

export const libXtstRuntimeDeps = ["libX11", "libXau", "libXcb", "libXdmcp", "libXext", "libXi", "toolchain"];

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["xorgproto", "libX11", "libXext", "libXi", "libXfixes"],
    libDeps: ["libX11", "libXext", "libXi", "libXfixes", "libXau", "libXcb", "libXdmcp"],
    pkgConfigDeps: ["libX11", "libXext", "libXi", "libXfixes", "libXau", "libXcb", "libXdmcp"],
    pkgConfigPaths: ["/deps/xorgproto/share/pkgconfig"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static

make -j$(nproc)
make install DESTDIR=$OUT

for pc in $OUT/lib/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc"
done

find $OUT/lib -name '*.so*' -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true
rm -rf $OUT/share/doc $OUT/share/man $OUT/lib/*.la 2>/dev/null || true
`,
  deps: [
    dep("source", libXtstSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("xorgproto", xorgprotoRecipe),
    dep("libX11", libX11Recipe),
    dep("libXext", libXextRecipe),
    dep("libXi", libXiRecipe),
    dep("libXfixes", libXfixesRecipe),
    dep("libXau", libXauRecipe),
    dep("libXcb", libXcbRecipe),
    dep("libXdmcp", libXdmcpRecipe),
  ],
  runtime_deps: libXtstRuntimeDeps,
});

await importToStore(recipe);
export const libXtstRecipe = recipe;
