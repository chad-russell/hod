//! libadwaita build recipe — GNOME Adwaita design library for GTK4.
//!
//! Builds libadwaita 1.7.12. Provides the modern GNOME widget toolkit
//! built on top of GTK4. Dependencies: GTK4, appstream, fribidi, glib.
//! Required by Nautilus and modern GNOME apps.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libadwaitaSourceRecipe } from "./libadwaita-source.js";
import { gtk4Recipe } from "../gtk4/gtk4.js";
import { appstreamRecipe } from "../appstream/appstream.js";
import { fribidiRecipe } from "../fribidi/fribidi.js";
import { glibRecipe } from "../glib/glib.js";
import { pangoRecipe } from "../pango/pango.js";
import { cairoRecipe } from "../cairo/cairo.js";
import { gdkPixbufRecipe } from "../gdk-pixbuf/gdk-pixbuf.js";
import { libepoxyRecipe } from "../libepoxy/libepoxy.js";
import { grapheneRecipe } from "../graphene/graphene.js";
import { atSpi2CoreRecipe } from "../at-spi2-core/at-spi2-core.js";
import { sharedMimeInfoRecipe } from "../shared-mime-info/shared-mime-info.js";
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
import { waylandRecipe } from "../wayland/wayland.js";
import { waylandProtocolsRecipe } from "../wayland-protocols/wayland-protocols.js";
import { libxkbcommonRecipe } from "../libxkbcommon/libxkbcommon.js";
import { libjpegRecipe } from "../libjpeg/libjpeg.js";
import { libtiffRecipe } from "../libtiff/libtiff.js";
import { zstdRecipe } from "../zstd/zstd.js";
import { libdrmRecipe } from "../libdrm/libdrm.js";
import { curlRecipe } from "../curl/curl.js";
import { opensslRecipe } from "../openssl/openssl.js";
import { libfyamlRecipe } from "../libfyaml/libfyaml.js";
import { xmlbRecipe } from "../xmlb/xmlb.js";
import { gperfRecipe } from "../gperf/gperf.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { sasscRecipe } from "../sassc/sassc.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

// Runtime deps: libadwaita needs all the shared libs in its transitive dep chain.
export const libadwaitaRuntimeDeps = [
  "appstream", "at-spi2-core", "bzip2", "cairo", "curl", "dbus", "expat",
  "fontconfig", "freetype", "fribidi", "gdk-pixbuf", "glib", "graphene",
  "gtk4", "harfbuzz", "libX11", "libXau", "libXcb", "libXcomposite", "libXcursor",
  "libXdamage", "libXdmcp", "libXext", "libXfixes", "libXi", "libXinerama",
  "libXrandr", "libXrender", "libXtst", "libdrm", "libepoxy", "libffi",
  "libfyaml", "libiconv", "libjpeg", "libpng", "libtiff", "libxml2",
  "openssl", "pango", "pcre2", "pixman", "shared-mime-info", "toolchain",
  "wayland", "xmlb", "xz", "zlib", "zstd",
];

// All deps that provide shared libs — for rpath-link.
const libDepNames = [
  "glib", "pango", "cairo", "gdk-pixbuf", "libepoxy", "graphene",
  "at-spi2-core", "dbus", "harfbuzz", "fontconfig", "freetype",
  "fribidi", "libpng", "pixman", "zlib", "expat", "bzip2", "libffi",
  "pcre2", "libX11", "libXext", "libXrender", "libXi", "libXrandr",
  "libXcursor", "libXinerama", "libXdamage", "libXcomposite",
  "libXfixes", "libXau", "libXcb", "libXdmcp", "libxml2", "libiconv",
  "xz", "libXtst", "wayland", "libdrm", "libjpeg", "libtiff", "zstd",
  "appstream", "curl", "openssl", "libfyaml", "xmlb",
  "gtk4", "fribidi",
];

const rpathLinkFlags = libDepNames.map((d) => `-Wl,-rpath-link,/deps/${d}/lib`).join(" ");

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    binDeps: ["glib", "gdk-pixbuf", "shared-mime-info", "gperf", "sassc"],
    includeDeps: [
      "glib", "pango", "cairo", "gdk-pixbuf", "libepoxy", "graphene",
      "at-spi2-core", "dbus",
      "harfbuzz", "fontconfig", "freetype", "fribidi", "libpng", "pixman",
      "zlib", "expat", "bzip2", "libffi", "pcre2",
      "libX11", "libXext", "libXrender", "libXi", "libXrandr",
      "libXcursor", "libXinerama", "libXdamage", "libXcomposite",
      "libXfixes", "libXau", "libXcb", "libXdmcp", "xorgproto",
      "libxml2", "libiconv", "xz", "libXtst", "wayland",
      "libxkbcommon", "libdrm", "libjpeg", "libtiff", "zstd",
      "appstream", "curl", "openssl", "libfyaml", "xmlb",
      "gtk4", "fribidi",
    ],
    includePaths: [
      "/deps/glib/include/glib-2.0",
      "/deps/glib/lib/glib-2.0/include",
      "/deps/freetype/include/freetype2",
    ],
    libDeps: libDepNames,
    pkgConfigDeps: [
      "glib", "pango", "cairo", "gdk-pixbuf", "libepoxy", "graphene",
      "at-spi2-core", "dbus",
      "harfbuzz", "fontconfig", "freetype", "fribidi", "libpng", "pixman",
      "zlib", "expat", "bzip2", "libffi", "pcre2",
      "libX11", "libXext", "libXrender", "libXi", "libXrandr",
      "libXcursor", "libXinerama", "libXdamage", "libXcomposite",
      "libXfixes", "libXau", "libXcb", "libXdmcp",
      "libxml2", "libXtst", "xz", "wayland",
      "libxkbcommon", "libdrm", "libjpeg", "libtiff", "zstd",
      "appstream", "curl", "openssl", "libfyaml", "xmlb",
      "gtk4", "fribidi",
    ],
    // TODO: pkgConfigPaths no longer needed — cProfile() now auto-includes
    // both lib/pkgconfig and share/pkgconfig for each pkgConfigDeps entry.
    // Add "xorgproto", "shared-mime-info" to pkgConfigDeps and remove this block.
    pkgConfigPaths: [
      "/deps/xorgproto/share/pkgconfig",
      "/deps/shared-mime-info/share/pkgconfig",
    ],
  }),
  sourceDir: true,
  script: `
# Patch out po/ subdir (needs gettext, not needed for library functionality)
sed -i "/subdir('po')/d" meson.build

export LDFLAGS="$HOD_DUMMY_RPATH \\
  ${rpathLinkFlags}"

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Ddefault_library=shared \\
  -Dintrospection=disabled \\
  -Dvapi=false \\
  -Dtests=false \\
  -Dexamples=false \\
  -Ddocumentation=false

ninja -C build
DESTDIR=$OUT ninja -C build install

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", libadwaitaSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("gtk4", gtk4Recipe),
    dep("appstream", appstreamRecipe),
    dep("fribidi", fribidiRecipe),
    dep("glib", glibRecipe),
    dep("pango", pangoRecipe),
    dep("cairo", cairoRecipe),
    dep("gdk-pixbuf", gdkPixbufRecipe),
    dep("libepoxy", libepoxyRecipe),
    dep("graphene", grapheneRecipe),
    dep("at-spi2-core", atSpi2CoreRecipe),
    dep("shared-mime-info", sharedMimeInfoRecipe),
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
    dep("wayland", waylandRecipe),
    dep("wayland-protocols", waylandProtocolsRecipe),
    dep("libxkbcommon", libxkbcommonRecipe),
    dep("libjpeg", libjpegRecipe),
    dep("libtiff", libtiffRecipe),
    dep("zstd", zstdRecipe),
    dep("libdrm", libdrmRecipe),
    dep("curl", curlRecipe),
    dep("openssl", opensslRecipe),
    dep("libfyaml", libfyamlRecipe),
    dep("xmlb", xmlbRecipe),
    dep("gperf", gperfRecipe),
    dep("sassc", sasscRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: libadwaitaRuntimeDeps,
});

await importToStore(recipe);
export const libadwaitaRecipe = recipe;
