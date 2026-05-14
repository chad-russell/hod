//! gtk3 build recipe — GTK+ 3 graphical toolkit.
//!
//! Builds GTK+ 3.24.49 with X11 backend enabled, Wayland/Broadway disabled.
//! Uses Meson build system. All major dependencies built from source via Hod.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { gtk3SourceRecipe } from "./gtk3-source.js";
import { glibRecipe } from "../glib/glib.js";
import { pangoRecipe } from "../pango/pango.js";
import { cairoRecipe } from "../cairo/cairo.js";
import { gdkPixbufRecipe } from "../gdk-pixbuf/gdk-pixbuf.js";
import { libepoxyRecipe } from "../libepoxy/libepoxy.js";
import { atSpi2CoreRecipe } from "../at-spi2-core/at-spi2-core.js";
import { sharedMimeInfoRecipe } from "../shared-mime-info/shared-mime-info.js";
import { harfbuzzRecipe } from "../harfbuzz/harfbuzz.js";
import { fontconfigRecipe } from "../fontconfig/fontconfig.js";
import { freetypeRecipe } from "../freetype/freetype.js";
import { fribidiRecipe } from "../fribidi/fribidi.js";
import { libpngRecipe } from "../libpng/libpng.js";
import { pixmanRecipe } from "../pixman/pixman.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { expatRecipe } from "../expat/expat.js";
import { bzip2Recipe } from "../bzip2/bzip2.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { libX11Recipe } from "../libX11/libX11.js";
import { libXextRecipe } from "../libXext/libXext.js";
import { libXrenderRecipe } from "../libXrender/libXrender.js";
import { libXiRecipe } from "../libXi/libXi.js";
import { libXrandrRecipe } from "../libXrandr/libXrandr.js";
import { libXcursorRecipe } from "../libXcursor/libXcursor.js";
import { libXineramaRecipe } from "../libXinerama/libXinerama.js";
import { libXdamageRecipe } from "../libXdamage/libXdamage.js";
import { libXcompositeRecipe } from "../libXcomposite/libXcomposite.js";
import { libXfixesRecipe } from "../libXfixes/libXfixes.js";
import { libXauRecipe } from "../libXau/libXau.js";
import { libXcbRecipe } from "../libxcb/libxcb.js";
import { libXdmcpRecipe } from "../libXdmcp/libXdmcp.js";
import { dbusRecipe } from "../dbus/dbus.js";
import { libxml2Recipe } from "../libxml2/libxml2.js";
import { libiconvRecipe } from "../libiconv/libiconv.js";
import { xzRecipe } from "../xz/xz.js";
import { libXtstRecipe } from "../libXtst/libXtst.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";

// Transitive runtime deps: GTK3 needs all shared libs in its dependency chain.
// Sorted alphabetically for determinism.
export const gtk3RuntimeDeps = [
  "at-spi2-core", "bzip2", "cairo", "dbus", "expat", "fontconfig",
  "freetype", "fribidi", "gdk-pixbuf", "glib", "harfbuzz", "libX11",
  "libXau", "libXcb", "libXcomposite", "libXcursor", "libXdamage",
  "libXdmcp", "libXext", "libXfixes", "libXi", "libXinerama",
  "libXrandr", "libXrender", "libXtst", "libepoxy", "libffi",
  "libiconv", "libpng", "libxml2", "pango", "pcre2", "pixman",
  "shared-mime-info", "toolchain", "xz", "zlib",
];

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    binDeps: ["glib", "gdk-pixbuf", "shared-mime-info"],
    includeDeps: [
      "glib", "pango", "cairo", "gdk-pixbuf", "libepoxy",
      "at-spi2-core", "dbus",
      "harfbuzz", "fontconfig", "freetype", "fribidi", "libpng", "pixman",
      "zlib", "expat", "bzip2", "libffi", "pcre2",
      "libX11", "libXext", "libXrender", "libXi", "libXrandr",
      "libXcursor", "libXinerama", "libXdamage", "libXcomposite",
      "libXfixes", "libXau", "libXcb", "libXdmcp", "xorgproto",
      "libxml2", "libiconv", "xz", "libXtst",
    ],
    includePaths: ["/deps/freetype/include/freetype2"],
    libDeps: [
      "glib", "pango", "cairo", "gdk-pixbuf", "libepoxy",
      "at-spi2-core", "dbus",
      "harfbuzz", "fontconfig", "freetype", "fribidi", "libpng", "pixman",
      "zlib", "expat", "bzip2", "libffi", "pcre2",
      "libX11", "libXext", "libXrender", "libXi", "libXrandr",
      "libXcursor", "libXinerama", "libXdamage", "libXcomposite",
      "libXfixes", "libXau", "libXcb", "libXdmcp",
      "libxml2", "libiconv", "xz", "libXtst",
    ],
    pkgConfigDeps: [
      "glib", "pango", "cairo", "gdk-pixbuf", "libepoxy",
      "at-spi2-core", "dbus",
      "harfbuzz", "fontconfig", "freetype", "fribidi", "libpng", "pixman",
      "zlib", "expat", "bzip2", "libffi", "pcre2",
      "libX11", "libXext", "libXrender", "libXi", "libXrandr",
      "libXcursor", "libXinerama", "libXdamage", "libXcomposite",
      "libXfixes", "libXau", "libXcb", "libXdmcp",
      "libxml2", "libXtst", "xz",
    ],
    // TODO: pkgConfigPaths no longer needed — cProfile() now auto-includes
    // both lib/pkgconfig and share/pkgconfig for each pkgConfigDeps entry.
    // Add "xorgproto", "shared-mime-info" to pkgConfigDeps and remove this block.
    pkgConfigPaths: [
      "/deps/xorgproto/share/pkgconfig",
      "/deps/shared-mime-info/share/pkgconfig",
    ],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

# Ensure glib tools (glib-mkenums, glib-compile-resources, gio-querymodules)
# and gdk-pixbuf tools (gdk-pixbuf-query-loaders) are findable.
# mesonProfile + binDeps already adds them to PATH.

export LD_LIBRARY_PATH="/deps/glib/lib:/deps/pango/lib:/deps/cairo/lib:/deps/gdk-pixbuf/lib:/deps/at-spi2-core/lib:/deps/libepoxy/lib:/deps/harfbuzz/lib:/deps/fontconfig/lib:/deps/freetype/lib:/deps/fribidi/lib:/deps/libpng/lib:/deps/pixman/lib:/deps/zlib/lib:/deps/expat/lib:/deps/bzip2/lib:/deps/libffi/lib:/deps/pcre2/lib:/deps/libX11/lib:/deps/libXext/lib:/deps/libXrender/lib:/deps/libXi/lib:/deps/libXrandr/lib:/deps/libXcursor/lib:/deps/libXinerama/lib:/deps/libXdamage/lib:/deps/libXcomposite/lib:/deps/libXfixes/lib:/deps/libXau/lib:/deps/libXcb/lib:/deps/libXdmcp/lib\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

export CPPFLAGS="-I/deps/freetype/include/freetype2"
export CXX="/deps/toolchain/bin/g++ --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"
export CXXFLAGS="-O2 -I/deps/freetype/include/freetype2"
export LDFLAGS="$HOD_DUMMY_RPATH \
  -L/deps/glib/lib -L/deps/pango/lib -L/deps/cairo/lib -L/deps/gdk-pixbuf/lib \
  -L/deps/at-spi2-core/lib -L/deps/libepoxy/lib -L/deps/harfbuzz/lib -L/deps/fontconfig/lib \
  -L/deps/freetype/lib -L/deps/fribidi/lib -L/deps/libpng/lib -L/deps/pixman/lib \
  -L/deps/zlib/lib -L/deps/expat/lib -L/deps/bzip2/lib -L/deps/libffi/lib -L/deps/pcre2/lib \
  -L/deps/libX11/lib -L/deps/libXext/lib -L/deps/libXrender/lib -L/deps/libXi/lib \
  -L/deps/libXrandr/lib -L/deps/libXcursor/lib -L/deps/libXinerama/lib \
  -L/deps/libXdamage/lib -L/deps/libXcomposite/lib -L/deps/libXfixes/lib \
  -L/deps/libXau/lib -L/deps/libXcb/lib -L/deps/libXdmcp/lib \
  -Wl,-rpath-link,/deps/glib/lib -Wl,-rpath-link,/deps/pango/lib \
  -Wl,-rpath-link,/deps/cairo/lib -Wl,-rpath-link,/deps/gdk-pixbuf/lib \
  -Wl,-rpath-link,/deps/at-spi2-core/lib -Wl,-rpath-link,/deps/libepoxy/lib \
  -Wl,-rpath-link,/deps/harfbuzz/lib -Wl,-rpath-link,/deps/fontconfig/lib \
  -Wl,-rpath-link,/deps/freetype/lib -Wl,-rpath-link,/deps/fribidi/lib \
  -Wl,-rpath-link,/deps/libpng/lib -Wl,-rpath-link,/deps/pixman/lib \
  -Wl,-rpath-link,/deps/zlib/lib -Wl,-rpath-link,/deps/expat/lib \
  -Wl,-rpath-link,/deps/bzip2/lib -Wl,-rpath-link,/deps/libffi/lib \
  -Wl,-rpath-link,/deps/pcre2/lib -Wl,-rpath-link,/deps/libX11/lib \
  -Wl,-rpath-link,/deps/libXext/lib -Wl,-rpath-link,/deps/libXrender/lib \
  -Wl,-rpath-link,/deps/libXi/lib -Wl,-rpath-link,/deps/libXrandr/lib \
  -Wl,-rpath-link,/deps/libXcursor/lib -Wl,-rpath-link,/deps/libXinerama/lib \
  -Wl,-rpath-link,/deps/libXdamage/lib -Wl,-rpath-link,/deps/libXcomposite/lib \
  -Wl,-rpath-link,/deps/libXfixes/lib -Wl,-rpath-link,/deps/libXau/lib \
  -Wl,-rpath-link,/deps/libXcb/lib -Wl,-rpath-link,/deps/libXdmcp/lib"

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Ddefault_library=shared \\
  -Dx11_backend=true \\
  -Dwayland_backend=false \\
  -Dbroadway_backend=false \\
  -Dwin32_backend=false \\
  -Dquartz_backend=false \\
  -Dgtk_doc=false \\
  -Dman=false \\
  -Dintrospection=false \\
  -Ddemos=false \\
  -Dexamples=false \\
  -Dtests=false \\
  -Dprint_backends=file \\
  -Dcolord=no \\
  -Dxinerama=yes

ninja -C build
DESTDIR=$OUT ninja -C build install

# Make pkg-config files relocatable
for pc in $OUT/lib/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
  esac
done

# Strip binaries and libraries
find $OUT/bin -type f -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true
# Do not strip .so files — the default strip can corrupt the dynamic symbol table
# and make the library un-linkable by downstream consumers.
rm -rf $OUT/share/doc $OUT/share/gtk-doc $OUT/share/man $OUT/lib/*.la 2>/dev/null || true
`,
  deps: [
    dep("source", gtk3SourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("glib", glibRecipe),
    dep("pango", pangoRecipe),
    dep("cairo", cairoRecipe),
    dep("gdk-pixbuf", gdkPixbufRecipe),
    dep("libepoxy", libepoxyRecipe),
    dep("at-spi2-core", atSpi2CoreRecipe),
    dep("shared-mime-info", sharedMimeInfoRecipe),
    dep("harfbuzz", harfbuzzRecipe),
    dep("fontconfig", fontconfigRecipe),
    dep("freetype", freetypeRecipe),
    dep("fribidi", fribidiRecipe),
    dep("libpng", libpngRecipe),
    dep("pixman", pixmanRecipe),
    dep("zlib", zlibRecipe),
    dep("expat", expatRecipe),
    dep("bzip2", bzip2Recipe),
    dep("libffi", libffiRecipe),
    dep("pcre2", pcre2Recipe),
    dep("libX11", libX11Recipe),
    dep("libXext", libXextRecipe),
    dep("libXrender", libXrenderRecipe),
    dep("libXi", libXiRecipe),
    dep("libXrandr", libXrandrRecipe),
    dep("libXcursor", libXcursorRecipe),
    dep("libXinerama", libXineramaRecipe),
    dep("libXdamage", libXdamageRecipe),
    dep("libXcomposite", libXcompositeRecipe),
    dep("libXfixes", libXfixesRecipe),
    dep("libXau", libXauRecipe),
    dep("libXcb", libXcbRecipe),
    dep("libXdmcp", libXdmcpRecipe),
    dep("xorgproto", xorgprotoRecipe),
    dep("dbus", dbusRecipe),
    dep("libxml2", libxml2Recipe),
    dep("libiconv", libiconvRecipe),
    dep("xz", xzRecipe),
    dep("libXtst", libXtstRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: gtk3RuntimeDeps,
});

await importToStore(recipe);
export const gtk3Recipe = recipe;
