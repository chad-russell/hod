//! cairo build recipe — 2D vector graphics library.
//!
//! Builds Cairo 1.18.4 with FreeType, Fontconfig, PNG, GLib, and Xlib/Xrender
//! support for the GTK3 X11 backend.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { cairoSourceRecipe } from "./cairo-source.js";
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
import { zlibRecipe } from "../zlib/zlib.js";
import { expatRecipe } from "../expat/expat.js";
import { bzip2Recipe } from "../bzip2/bzip2.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL } from "../../helpers/strip.js";

export const cairoRuntimeDeps = [
  "expat", "fontconfig", "freetype", "glib", "libX11", "libXau", "libXcb",
  "libXdmcp", "libXext", "libXrender", "libffi", "libpng", "pcre2",
  "pixman", "toolchain", "zlib",
];

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    includeDeps: ["pixman", "freetype", "fontconfig", "libpng", "glib", "libX11", "libXrender", "libXext", "libXau", "libXcb", "libXdmcp", "zlib", "expat", "bzip2", "libffi", "pcre2"],
    includePaths: ["/deps/freetype/include/freetype2"],
    libDeps: ["pixman", "freetype", "fontconfig", "libpng", "glib", "libX11", "libXrender", "libXext", "libXau", "libXcb", "libXdmcp", "zlib", "expat", "bzip2", "libffi", "pcre2"],
    pkgConfigDeps: ["pixman", "freetype", "fontconfig", "libpng", "glib", "libX11", "libXrender", "libXext", "libXau", "libXcb", "libXdmcp", "zlib", "expat", "bzip2", "libffi", "pcre2"],
    // TODO: pkgConfigPaths no longer needed — cProfile() now auto-includes
    // both lib/pkgconfig and share/pkgconfig for each pkgConfigDeps entry.
    // Add "xorgproto" to pkgConfigDeps and remove this pkgConfigPaths block.
    pkgConfigPaths: ["/deps/xorgproto/share/pkgconfig"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

export LD_LIBRARY_PATH="/deps/zlib/lib:/deps/expat/lib\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export CPPFLAGS="-I/deps/freetype/include/freetype2"
export LDFLAGS="$HOD_DUMMY_RPATH \
  -L/deps/pixman/lib -L/deps/freetype/lib -L/deps/fontconfig/lib -L/deps/libpng/lib -L/deps/glib/lib \
  -L/deps/libX11/lib -L/deps/libXrender/lib -L/deps/libXext/lib -L/deps/libXau/lib -L/deps/libXcb/lib -L/deps/libXdmcp/lib \
  -L/deps/zlib/lib -L/deps/expat/lib -L/deps/bzip2/lib -L/deps/libffi/lib -L/deps/pcre2/lib \
  -Wl,-rpath-link,/deps/pixman/lib -Wl,-rpath-link,/deps/freetype/lib -Wl,-rpath-link,/deps/fontconfig/lib \
  -Wl,-rpath-link,/deps/libpng/lib -Wl,-rpath-link,/deps/glib/lib -Wl,-rpath-link,/deps/libX11/lib \
  -Wl,-rpath-link,/deps/libXrender/lib -Wl,-rpath-link,/deps/libXext/lib -Wl,-rpath-link,/deps/libXau/lib -Wl,-rpath-link,/deps/libXcb/lib \
  -Wl,-rpath-link,/deps/libXdmcp/lib -Wl,-rpath-link,/deps/zlib/lib -Wl,-rpath-link,/deps/expat/lib \
  -Wl,-rpath-link,/deps/bzip2/lib -Wl,-rpath-link,/deps/libffi/lib -Wl,-rpath-link,/deps/pcre2/lib"

meson setup build \
  --prefix=/ \
  --libdir=lib \
  --buildtype=release \
  -Ddefault_library=shared \
  -Dfreetype=enabled \
  -Dfontconfig=enabled \
  -Dpng=enabled \
  -Dzlib=enabled \
  -Dglib=enabled \
  -Dxlib=enabled \
  -Dxcb=disabled \
  -Dxlib-xcb=disabled \
  -Dquartz=disabled \
  -Dspectre=disabled \
  -Dlzo=disabled \
  -Dsymbol-lookup=disabled \
  -Dtests=disabled \
  -Dgtk_doc=false

ninja -C build
DESTDIR=$OUT ninja -C build install

for pc in $OUT/lib/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
  esac
done

# Cairo 1.18's Meson-generated cairo-ft.pc omits Fontconfig even when
# CAIRO_HAS_FC_FONT is enabled; Pango's cairo-ft feature check needs it.
if [ -f $OUT/lib/pkgconfig/cairo-ft.pc ]; then
  sed -i 's|^Requires: cairo, freetype2.*|Requires: cairo, freetype2 >=  23.0.17, fontconfig|' $OUT/lib/pkgconfig/cairo-ft.pc
fi

find $OUT/bin -type f -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true
${STRIP_ALL}
`,
  deps: [
    dep("source", cairoSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
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
    dep("zlib", zlibRecipe),
    dep("expat", expatRecipe),
    dep("bzip2", bzip2Recipe),
    dep("libffi", libffiRecipe),
    dep("pcre2", pcre2Recipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: cairoRuntimeDeps,
});

await importToStore(recipe);
export const cairoRecipe = recipe;
