//! pango build recipe — text layout/rendering library.
//!
//! Builds Pango 1.56.4 with Cairo, Fontconfig, FreeType, HarfBuzz, and FriBidi.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { pangoSourceRecipe } from "./pango-source.js";
import { cairoRecipe } from "../cairo/cairo.js";
import { fribidiRecipe } from "../fribidi/fribidi.js";
import { glibRecipe } from "../glib/glib.js";
import { harfbuzzRecipe } from "../harfbuzz/harfbuzz.js";
import { fontconfigRecipe } from "../fontconfig/fontconfig.js";
import { freetypeRecipe } from "../freetype/freetype.js";
import { libpngRecipe } from "../libpng/libpng.js";
import { pixmanRecipe } from "../pixman/pixman.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { expatRecipe } from "../expat/expat.js";
import { bzip2Recipe } from "../bzip2/bzip2.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { libX11Recipe } from "../libX11/libX11.js";
import { libXrenderRecipe } from "../libXrender/libXrender.js";
import { libXextRecipe } from "../libXext/libXext.js";
import { libXauRecipe } from "../libXau/libXau.js";
import { libXcbRecipe } from "../libxcb/libxcb.js";
import { libXdmcpRecipe } from "../libXdmcp/libXdmcp.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL } from "../../helpers/strip.js";

export const pangoRuntimeDeps = ["bzip2", "cairo", "expat", "fontconfig", "freetype", "fribidi", "glib", "harfbuzz", "libX11", "libXau", "libXcb", "libXdmcp", "libXext", "libXrender", "libffi", "libpng", "pcre2", "pixman", "toolchain", "zlib"];

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    includeDeps: ["cairo", "fribidi", "glib", "harfbuzz", "fontconfig", "freetype", "libpng", "pixman", "zlib", "expat", "bzip2", "libffi", "pcre2", "libX11", "libXrender", "libXext", "libXau", "libXcb", "libXdmcp"],
    includePaths: ["/deps/freetype/include/freetype2"],
    libDeps: ["cairo", "fribidi", "glib", "harfbuzz", "fontconfig", "freetype", "libpng", "pixman", "zlib", "expat", "bzip2", "libffi", "pcre2", "libX11", "libXrender", "libXext", "libXau", "libXcb", "libXdmcp"],
    pkgConfigDeps: ["cairo", "fribidi", "glib", "harfbuzz", "fontconfig", "freetype", "libpng", "pixman", "zlib", "expat", "bzip2", "libffi", "pcre2", "libX11", "libXrender", "libXext", "libXau", "libXcb", "libXdmcp"],
    // TODO: pkgConfigPaths no longer needed — cProfile() now auto-includes
    // both lib/pkgconfig and share/pkgconfig for each pkgConfigDeps entry.
    // Add "xorgproto" to pkgConfigDeps and remove this pkgConfigPaths block.
    pkgConfigPaths: ["/deps/xorgproto/share/pkgconfig"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

# Cairo was built with CAIRO_HAS_FC_FONT=1, but Pango's Meson probe can fail
# because cairo-ft.pc under-describes Fontconfig on this Cairo release.
sed -i "/does not have the required FontConfig support/s|error.*|message('Skipping cairo-ft FontConfig probe; Cairo has CAIRO_HAS_FC_FONT')|" meson.build

export LD_LIBRARY_PATH="/deps/zlib/lib:/deps/expat/lib\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export CXX="/deps/toolchain/bin/g++ --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"
export CXXFLAGS="-O2 -I/deps/freetype/include/freetype2"
export CPPFLAGS="-I/deps/freetype/include/freetype2"
export LDFLAGS="$HOD_DUMMY_RPATH \
  -Wl,-rpath-link,/deps/cairo/lib -Wl,-rpath-link,/deps/fribidi/lib -Wl,-rpath-link,/deps/glib/lib \
  -Wl,-rpath-link,/deps/harfbuzz/lib -Wl,-rpath-link,/deps/fontconfig/lib -Wl,-rpath-link,/deps/freetype/lib \
  -Wl,-rpath-link,/deps/libpng/lib -Wl,-rpath-link,/deps/pixman/lib -Wl,-rpath-link,/deps/zlib/lib \
  -Wl,-rpath-link,/deps/expat/lib -Wl,-rpath-link,/deps/bzip2/lib -Wl,-rpath-link,/deps/libffi/lib \
  -Wl,-rpath-link,/deps/pcre2/lib -Wl,-rpath-link,/deps/libX11/lib -Wl,-rpath-link,/deps/libXrender/lib \
  -Wl,-rpath-link,/deps/libXext/lib -Wl,-rpath-link,/deps/libXau/lib -Wl,-rpath-link,/deps/libXcb/lib \
  -Wl,-rpath-link,/deps/libXdmcp/lib"

meson setup build \
  --prefix=/ \
  --libdir=lib \
  --buildtype=release \
  -Ddefault_library=shared \
  -Dintrospection=disabled \
  -Ddocumentation=false \
  -Dgtk_doc=false \
  -Dman-pages=false \
  -Dbuild-testsuite=false \
  -Dbuild-examples=false \
  -Dfontconfig=enabled \
  -Dfreetype=enabled \
  -Dcairo=enabled \
  -Dxft=disabled \
  -Dlibthai=disabled \
  -Dsysprof=disabled

ninja -C build
DESTDIR=$OUT ninja -C build install

for pc in $OUT/lib/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
  esac
done

find $OUT/bin -type f -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true
${STRIP_ALL}
`,
  deps: [
    dep("source", pangoSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("cairo", cairoRecipe),
    dep("fribidi", fribidiRecipe),
    dep("glib", glibRecipe),
    dep("harfbuzz", harfbuzzRecipe),
    dep("fontconfig", fontconfigRecipe),
    dep("freetype", freetypeRecipe),
    dep("libpng", libpngRecipe),
    dep("pixman", pixmanRecipe),
    dep("zlib", zlibRecipe),
    dep("expat", expatRecipe),
    dep("bzip2", bzip2Recipe),
    dep("libffi", libffiRecipe),
    dep("pcre2", pcre2Recipe),
    dep("libX11", libX11Recipe),
    dep("libXrender", libXrenderRecipe),
    dep("libXext", libXextRecipe),
    dep("libXau", libXauRecipe),
    dep("libXcb", libXcbRecipe),
    dep("libXdmcp", libXdmcpRecipe),
    dep("xorgproto", xorgprotoRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: pangoRuntimeDeps,
});

await importToStore(recipe);
export const pangoRecipe = recipe;
