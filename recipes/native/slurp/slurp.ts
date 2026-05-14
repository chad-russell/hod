//! slurp native build recipe — Wayland screen region selector.
//!
//! Builds slurp 1.5.0, an interactive region selector for Wayland compositors.
//!
//! Dependencies: wayland, wayland-protocols, cairo, libxkbcommon (all built).
//! Man pages disabled to avoid the optional scdoc dependency.
//!
//! Produces:
//!   - slurp (screen region selector)

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { slurpSourceRecipe } from "./slurp-source.js";
import { waylandRecipe, waylandRuntimeDeps } from "../wayland/wayland.js";
import { waylandProtocolsRecipe } from "../wayland-protocols/wayland-protocols.js";
import { cairoRecipe, cairoRuntimeDeps } from "../cairo/cairo.js";
import { libxkbcommonRecipe, libxkbcommonRuntimeDeps } from "../libxkbcommon/libxkbcommon.js";
import { expatRecipe } from "../expat/expat.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { pixmanRecipe } from "../pixman/pixman.js";
import { freetypeRecipe } from "../freetype/freetype.js";
import { fontconfigRecipe } from "../fontconfig/fontconfig.js";
import { libpngRecipe } from "../libpng/libpng.js";
import { glibRecipe } from "../glib/glib.js";
import { libX11Recipe } from "../libX11/libX11.js";
import { libXrenderRecipe } from "../libXrender/libXrender.js";
import { libXextRecipe } from "../libXext/libXext.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { libXauRecipe } from "../libXau/libXau.js";
import { libXcbRecipe } from "../libxcb/libxcb.js";
import { libXdmcpRecipe } from "../libXdmcp/libXdmcp.js";
import { bzip2Recipe } from "../bzip2/bzip2.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...mesonProfile({
    includeDeps: [
      "wayland", "cairo", "libxkbcommon", "pixman", "freetype", "fontconfig", "libpng",
      "glib", "libX11", "libXrender", "libXext", "libXau", "libXcb", "libXdmcp",
      "zlib", "expat", "bzip2", "libffi", "pcre2",
    ],
    includePaths: ["/deps/freetype/include/freetype2"],
    libDeps: [
      "wayland", "cairo", "libxkbcommon", "pixman", "freetype", "fontconfig", "libpng",
      "glib", "libX11", "libXrender", "libXext", "libXau", "libXcb", "libXdmcp",
      "zlib", "expat", "bzip2", "libffi", "pcre2",
    ],
    pkgConfigDeps: [
      "wayland", "cairo", "libxkbcommon", "pixman", "freetype", "fontconfig", "libpng",
      "glib", "libX11", "libXrender", "libXext", "libXau", "libXcb", "libXdmcp",
      "zlib", "expat", "bzip2", "libffi", "pcre2",
    ],
    // TODO: pkgConfigPaths no longer needed — cProfile() now auto-includes
    // both lib/pkgconfig and share/pkgconfig for each pkgConfigDeps entry.
    // Add "wayland-protocols", "xorgproto" to pkgConfigDeps and remove this block.
    pkgConfigPaths: ["/deps/wayland-protocols/share/pkgconfig", "/deps/xorgproto/share/pkgconfig"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

# wayland-scanner is used by protocol/meson.build and needs its shared library
# dependencies at runtime during the build.
export PATH="/deps/wayland/bin:$PATH"
export LD_LIBRARY_PATH="/deps/expat/lib:/deps/wayland/lib:/deps/zlib/lib\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

meson setup build \
  --prefix=/ \
  --buildtype=release \
  -Dman-pages=disabled

ninja -C build
DESTDIR=$OUT ninja -C build install

${STRIP_ALL}

# Clean up docs and man pages
rm -rf $OUT/share/doc $OUT/share/info $OUT/share/man 2>/dev/null || true
`,
  deps: [
    dep("source", slurpSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("wayland", waylandRecipe),
    dep("wayland-protocols", waylandProtocolsRecipe),
    dep("cairo", cairoRecipe),
    dep("libxkbcommon", libxkbcommonRecipe),
    dep("expat", expatRecipe),
    dep("libffi", libffiRecipe),
    dep("zlib", zlibRecipe),
    dep("pixman", pixmanRecipe),
    dep("freetype", freetypeRecipe),
    dep("fontconfig", fontconfigRecipe),
    dep("libpng", libpngRecipe),
    dep("glib", glibRecipe),
    dep("libX11", libX11Recipe),
    dep("libXrender", libXrenderRecipe),
    dep("libXext", libXextRecipe),
    dep("xorgproto", xorgprotoRecipe),
    dep("libXau", libXauRecipe),
    dep("libXcb", libXcbRecipe),
    dep("libXdmcp", libXdmcpRecipe),
    dep("bzip2", bzip2Recipe),
    dep("pcre2", pcre2Recipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: [...new Set([
    "cairo",
    "libxkbcommon",
    "wayland",
    ...waylandRuntimeDeps,
    ...cairoRuntimeDeps,
    ...libxkbcommonRuntimeDeps,
  ])].sort(),
});

await importToStore(recipe);
export const slurpRecipe = recipe;
