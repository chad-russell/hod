//! libepoxy build recipe — OpenGL function pointer management.
//!
//! Builds libepoxy 1.5.10 with GLX/X11 support and without tests/docs.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libepoxySourceRecipe } from "./libepoxy-source.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { libX11Recipe } from "../libX11/libX11.js";
import { libXauRecipe } from "../libXau/libXau.js";
import { libXcbRecipe } from "../libxcb/libxcb.js";
import { libXdmcpRecipe } from "../libXdmcp/libXdmcp.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { expatRecipe } from "../expat/expat.js";
import { mesonProfile } from "../../helpers/meson.js";

export const libepoxyRuntimeDeps = ["toolchain"];

const recipe = await shellBuild({
  ...mesonProfile({
    includeDeps: ["xorgproto", "libX11", "libXau", "libXcb", "libXdmcp"],
    libDeps: ["libX11", "libXau", "libXcb", "libXdmcp"],
    pkgConfigDeps: ["libX11", "libXau", "libXcb", "libXdmcp"],
    pkgConfigPaths: ["/deps/xorgproto/share/pkgconfig"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

find . -name '*.py' -type f -exec sed -i '1s|^#!/usr/bin/env python3|#!/deps/python/bin/python3|' {} +

export LD_LIBRARY_PATH="/deps/zlib/lib:/deps/expat/lib\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export LDFLAGS="$HOD_DUMMY_RPATH \
  -Wl,-rpath-link,/deps/libX11/lib -Wl,-rpath-link,/deps/libXau/lib \
  -Wl,-rpath-link,/deps/libXcb/lib -Wl,-rpath-link,/deps/libXdmcp/lib"

meson setup build \
  --prefix=/ \
  --libdir=lib \
  --buildtype=release \
  -Ddefault_library=shared \
  -Dglx=yes \
  -Degl=no \
  -Dx11=true \
  -Dtests=false \
  -Ddocs=false

ninja -C build
DESTDIR=$OUT ninja -C build install

for pc in $OUT/lib/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
  esac
done

find $OUT/bin $OUT/libexec -type f -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true
find $OUT/lib -name '*.so*' -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true
rm -rf $OUT/share/doc $OUT/share/gtk-doc $OUT/share/man 2>/dev/null || true
`,
  deps: [
    dep("source", libepoxySourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("xorgproto", xorgprotoRecipe),
    dep("libX11", libX11Recipe),
    dep("libXau", libXauRecipe),
    dep("libXcb", libXcbRecipe),
    dep("libXdmcp", libXdmcpRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
    dep("zlib", zlibRecipe),
    dep("expat", expatRecipe),
  ],
  runtime_deps: libepoxyRuntimeDeps,
});

await importToStore(recipe);
export const libepoxyRecipe = recipe;
