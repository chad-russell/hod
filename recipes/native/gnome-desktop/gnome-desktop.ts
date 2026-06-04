//! gnome-desktop build recipe — GNOME desktop utility library.
//!
//! Builds gnome-desktop 44.5 (GTK4 variant). Provides gnome-desktop-4,
//! gnome-bg-4, and gnome-rr-4 shared libraries + pkg-config files.
//!
//! Dependencies: GTK4 (and its full dep tree), gsettings-desktop-schemas,
//! xkeyboard-config, iso-codes, libseccomp.
//!
//! Notes:
//! - Built with -Dbuild_gtk4=true, -Dlegacy_library=false (no GTK3).
//! - subdir('po') and subdir('tests') patched out.
//! - udev and systemd disabled.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { gnomeDesktopSourceRecipe } from "./gnome-desktop-source.js";

// GTK4 and its full dependency tree
import { gtk4Recipe } from "../gtk4/gtk4.js";
import { gdkPixbufRecipe } from "../gdk-pixbuf/gdk-pixbuf.js";
import { glibRecipe } from "../glib/glib.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { libxml2Recipe } from "../libxml2/libxml2.js";
import { libiconvRecipe } from "../libiconv/libiconv.js";
import { xzRecipe } from "../xz/xz.js";
import { fontconfigRecipe } from "../fontconfig/fontconfig.js";
import { freetypeRecipe } from "../freetype/freetype.js";
import { libpngRecipe } from "../libpng/libpng.js";
import { pixmanRecipe } from "../pixman/pixman.js";
import { cairoRecipe } from "../cairo/cairo.js";
import { harfbuzzRecipe } from "../harfbuzz/harfbuzz.js";
import { pangoRecipe } from "../pango/pango.js";
import { fribidiRecipe } from "../fribidi/fribidi.js";
import { libepoxyRecipe } from "../libepoxy/libepoxy.js";
import { grapheneRecipe } from "../graphene/graphene.js";
import { libdrmRecipe } from "../libdrm/libdrm.js";
import { waylandRecipe } from "../wayland/wayland.js";
import { libxkbcommonRecipe } from "../libxkbcommon/libxkbcommon.js";
import { atSpi2CoreRecipe } from "../at-spi2-core/at-spi2-core.js";
import { dbusRecipe } from "../dbus/dbus.js";
import { expatRecipe } from "../expat/expat.js";
import { sharedMimeInfoRecipe } from "../shared-mime-info/shared-mime-info.js";
import { libjpegRecipe } from "../libjpeg/libjpeg.js";
import { libtiffRecipe } from "../libtiff/libtiff.js";
import { libportalRecipe } from "../libportal/libportal.js";
import { appstreamRecipe } from "../appstream/appstream.js";
import { libadwaitaRecipe } from "../libadwaita/libadwaita.js";
import { sasscRecipe } from "../sassc/sassc.js";
import { xmlbRecipe } from "../xmlb/xmlb.js";
import { libfyamlRecipe } from "../libfyaml/libfyaml.js";
import { gperfRecipe } from "../gperf/gperf.js";
import { libarchiveRecipe } from "../libarchive/libarchive.js";
import { opensslRecipe } from "../openssl/openssl.js";
import { bzip2Recipe } from "../bzip2/bzip2.js";
import { zstdRecipe } from "../zstd/zstd.js";
import { curlRecipe } from "../curl/curl.js";
import { sqliteRecipe } from "../sqlite/sqlite.js";
import { libsoup3Recipe } from "../libsoup3/libsoup3.js";
import { nghttp2Recipe } from "../nghttp2/nghttp2.js";
import { libpslRecipe } from "../libpsl/libpsl.js";
import { libidn2Recipe } from "../libidn2/libidn2.js";
import { libunistringRecipe } from "../libunistring/libunistring.js";
import { jsonGlibRecipe } from "../json-glib/json-glib.js";

// X11 libraries (transitive deps of GTK4 → cairo)
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
import { libXtstRecipe } from "../libXtst/libXtst.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";

// GNOME desktop-specific deps
import { libseccompRecipe } from "../libseccomp/libseccomp.js";
import { gsettingsDesktopSchemasRecipe } from "../gsettings-desktop-schemas/gsettings-desktop-schemas.js";
import { xkeyboardConfigRecipe } from "../xkeyboard-config/xkeyboard-config.js";
import { isoCodesRecipe } from "../iso-codes/iso-codes.js";

// Build tools
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    binDeps: ["glib"],
    includeDeps: [
      "gtk4", "gdk-pixbuf", "glib", "libffi", "pcre2", "libxml2",
      "libiconv", "fontconfig", "freetype", "libpng", "pixman",
      "cairo", "harfbuzz", "pango", "fribidi", "libepoxy", "graphene",
      "libdrm", "wayland", "libxkbcommon", "at-spi2-core", "dbus",
      "expat", "libseccomp", "libportal", "openssl",
      "libX11", "libXext", "libXrender", "libXi", "libXrandr",
      "libXcursor", "libXinerama", "libXdamage", "libXcomposite",
      "libXfixes", "libXau", "libXcb", "libXdmcp", "libXtst",
      "gsettings-desktop-schemas",
    ],
    includePaths: [
      "/deps/glib/include/glib-2.0",
      "/deps/glib/lib/glib-2.0/include",
      "/deps/libxml2/include/libxml2",
      "/deps/dbus/include/dbus-1.0",
      "/deps/dbus/lib/dbus-1.0/include",
      "/deps/cairo/include/cairo",
      "/deps/freetype/include/freetype2",
      "/deps/harfbuzz/include/harfbuzz",
      "/deps/pango/include/pango-1.0",
      "/deps/libdrm/include/libdrm",
      "/deps/gdk-pixbuf/include/gdk-pixbuf-2.0",
      "/deps/gdk-pixbuf/lib/gdk-pixbuf-2.0/include",
      "/deps/gsettings-desktop-schemas/include/gsettings-desktop-schemas",
    ],
    libDeps: [
      "gtk4", "gdk-pixbuf", "glib", "libffi", "pcre2", "zlib", "libxml2",
      "libiconv", "xz", "fontconfig", "freetype", "libpng", "pixman",
      "cairo", "harfbuzz", "pango", "fribidi", "libepoxy", "graphene",
      "libdrm", "wayland", "libxkbcommon", "at-spi2-core", "dbus", "expat",
      "libseccomp", "libjpeg", "libtiff", "libportal", "openssl", "bzip2",
      "zstd", "curl", "libarchive",
      "libX11", "libXext", "libXrender", "libXi", "libXrandr",
      "libXcursor", "libXinerama", "libXdamage", "libXcomposite",
      "libXfixes", "libXau", "libXcb", "libXdmcp", "libXtst",
    ],
    pkgConfigDeps: [
      "gtk4", "gdk-pixbuf", "glib", "libffi", "pcre2", "zlib",
      "libxml2", "fontconfig", "freetype", "libpng", "pixman",
      "cairo", "harfbuzz", "pango", "fribidi", "libepoxy", "graphene",
      "libdrm", "wayland", "libxkbcommon", "at-spi2-core", "dbus",
      "expat", "libseccomp", "xkeyboard-config", "iso-codes",
      "gsettings-desktop-schemas", "libportal", "openssl", "xz",
      "bzip2", "zstd", "curl", "libarchive", "libiconv",
      "libjpeg", "libtiff", "sqlite", "libsoup3", "nghttp2",
      "libpsl", "libidn2", "json-glib",
      "libX11", "libXext", "libXrender", "libXi", "libXrandr",
      "libXcursor", "libXinerama", "libXdamage", "libXcomposite",
      "libXfixes", "libXau", "libXcb", "libXdmcp", "libXtst",
    ],
    // TODO: pkgConfigPaths no longer needed — cProfile() now auto-includes
    // both lib/pkgconfig and share/pkgconfig for each pkgConfigDeps entry.
    // All deps listed here are already in pkgConfigDeps — remove this block.
    pkgConfigPaths: [
      "/deps/xorgproto/share/pkgconfig",
      "/deps/shared-mime-info/share/pkgconfig",
      "/deps/gsettings-desktop-schemas/share/pkgconfig",
      "/deps/xkeyboard-config/share/pkgconfig",
      "/deps/iso-codes/share/pkgconfig",
    ],
  }),
  sourceDir: true,
  script: `
# Patch out subdirs we don't need or can't build
sed -i "/subdir('po')/d" meson.build
sed -i "/subdir('tests')/d" meson.build

# Fix gnome-rr meson.build: when introspection is disabled, libgnome_rr_gir
# is set to '' which causes "File does not exist" in declare_dependency.
# Patch to not include it in sources.
sed -i "s/    libgnome_rr_gir,$/    # libgnome_rr_gir, # patched out for no-introspection/" libgnome-desktop/gnome-rr/meson.build

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Ddefault_library=shared \\
  -Dbuild_gtk4=true \\
  -Dlegacy_library=false \\
  -Dudev=disabled \\
  -Dsystemd=disabled \\
  -Dintrospection=false \\
  -Ddesktop_docs=false \\
  -Dgtk_doc=false \\
  -Ddebug_tools=false \\
  -Dinstalled_tests=false

ninja -C build
DESTDIR=$OUT ninja -C build install

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", gnomeDesktopSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("gtk4", gtk4Recipe),
    dep("gdk-pixbuf", gdkPixbufRecipe),
    dep("glib", glibRecipe),
    dep("libffi", libffiRecipe),
    dep("pcre2", pcre2Recipe),
    dep("zlib", zlibRecipe),
    dep("libxml2", libxml2Recipe),
    dep("libiconv", libiconvRecipe),
    dep("xz", xzRecipe),
    dep("fontconfig", fontconfigRecipe),
    dep("freetype", freetypeRecipe),
    dep("libpng", libpngRecipe),
    dep("pixman", pixmanRecipe),
    dep("cairo", cairoRecipe),
    dep("harfbuzz", harfbuzzRecipe),
    dep("pango", pangoRecipe),
    dep("fribidi", fribidiRecipe),
    dep("libepoxy", libepoxyRecipe),
    dep("graphene", grapheneRecipe),
    dep("libdrm", libdrmRecipe),
    dep("wayland", waylandRecipe),
    dep("libxkbcommon", libxkbcommonRecipe),
    dep("at-spi2-core", atSpi2CoreRecipe),
    dep("dbus", dbusRecipe),
    dep("expat", expatRecipe),
    dep("shared-mime-info", sharedMimeInfoRecipe),
    dep("libseccomp", libseccompRecipe),
    dep("gsettings-desktop-schemas", gsettingsDesktopSchemasRecipe),
    dep("xkeyboard-config", xkeyboardConfigRecipe),
    dep("iso-codes", isoCodesRecipe),
    dep("libjpeg", libjpegRecipe),
    dep("libtiff", libtiffRecipe),
    dep("libportal", libportalRecipe),
    dep("appstream", appstreamRecipe),
    dep("libadwaita", libadwaitaRecipe),
    dep("sassc", sasscRecipe),
    dep("xmlb", xmlbRecipe),
    dep("libfyaml", libfyamlRecipe),
    dep("gperf", gperfRecipe),
    dep("libarchive", libarchiveRecipe),
    dep("openssl", opensslRecipe),
    dep("bzip2", bzip2Recipe),
    dep("zstd", zstdRecipe),
    dep("curl", curlRecipe),
    dep("sqlite", sqliteRecipe),
    dep("libsoup3", libsoup3Recipe),
    dep("nghttp2", nghttp2Recipe),
    dep("libpsl", libpslRecipe),
    dep("libidn2", libidn2Recipe),
    dep("libunistring", libunistringRecipe),
    dep("json-glib", jsonGlibRecipe),
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
    dep("libXtst", libXtstRecipe),
    dep("xorgproto", xorgprotoRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: [
    "appstream", "bzip2", "cairo", "curl", "dbus", "expat", "fontconfig",
    "freetype", "fribidi", "gdk-pixbuf", "glib", "gperf", "graphene",
    "gsettings-desktop-schemas", "gtk4", "harfbuzz", "iso-codes",
    "libX11", "libXau", "libXcb", "libXcomposite", "libXcursor",
    "libXdamage", "libXdmcp", "libXext", "libXfixes", "libXi",
    "libXinerama", "libXrandr", "libXrender", "libXtst",
    "libarchive", "libdrm", "libepoxy", "libffi", "libfyaml",
    "libiconv", "libidn2", "libjpeg", "libpng", "libportal",
    "libpsl", "libseccomp", "libtiff", "libunistring", "libxkbcommon",
    "libxml2", "nghttp2", "openssl", "pango", "pcre2", "pixman",
    "sassc", "shared-mime-info", "sqlite", "toolchain", "wayland",
    "xkeyboard-config", "xmlb", "xz", "zlib", "zstd",
  ],
});

await importToStore(recipe);
export const gnomeDesktopRecipe = recipe;
