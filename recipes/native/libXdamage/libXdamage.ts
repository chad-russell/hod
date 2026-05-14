//! libXdamage build recipe — X Damage extension library.
//!
//! Builds libXdamage 1.1.6. Part of the GTK3 X11 extension stack.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { libXdamageSourceRecipe } from "./libXdamage-source.js";
import { libX11Recipe } from "../libX11/libX11.js";
import { libXfixesRecipe } from "../libXfixes/libXfixes.js";
import { libXauRecipe } from "../libXau/libXau.js";
import { libXcbRecipe } from "../libxcb/libxcb.js";
import { libXdmcpRecipe } from "../libXdmcp/libXdmcp.js";
import { cProfile } from "../../helpers/c.js";

export const libXdamageRuntimeDeps = ["libX11", "libXau", "libXcb", "libXdmcp", "libXfixes", "toolchain"];

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
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

./configure \
  --prefix=/ \
  --enable-shared \
  --disable-static

make -j$(nproc)
make install DESTDIR=$OUT

# Make pkg-config files relocatable.
for pc in $OUT/lib/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
  esac
done

find $OUT/lib -name '*.so*' -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true
rm -rf $OUT/share/doc $OUT/share/man $OUT/lib/*.la 2>/dev/null || true
`,
  deps: [
    dep("source", libXdamageSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("xorgproto", xorgprotoRecipe),
    dep("libX11", libX11Recipe),
    dep("libXfixes", libXfixesRecipe),
    dep("libXau", libXauRecipe),
    dep("libXcb", libXcbRecipe),
    dep("libXdmcp", libXdmcpRecipe),
  ],
  runtime_deps: libXdamageRuntimeDeps,
});

await importToStore(recipe);
export const libXdamageRecipe = recipe;
