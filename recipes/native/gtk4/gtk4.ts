//! GTK4 build recipe — GTK 4 graphical toolkit.
//!
//! Builds GTK 4.18.6 with X11 backend enabled, Wayland/Broadway disabled.
//! Uses Meson build system. All major dependencies built from source via Hod.
//! Required by libadwaita and modern GNOME applications like Nautilus.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { gtk4SourceRecipe } from "./gtk4-source.js";
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
import { waylandRecipe } from "../wayland/wayland.js";
import { waylandProtocolsRecipe } from "../wayland-protocols/wayland-protocols.js";
import { libxkbcommonRecipe } from "../libxkbcommon/libxkbcommon.js";
import { libjpegRecipe } from "../libjpeg/libjpeg.js";
import { libtiffRecipe } from "../libtiff/libtiff.js";
import { zstdRecipe } from "../zstd/zstd.js";
import { libdrmRecipe } from "../libdrm/libdrm.js";
import { libglvndRecipe } from "../libglvnd/libglvnd.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

// Transitive runtime deps: GTK4 needs all shared libs in its dependency chain.
export const gtk4RuntimeDeps = [
  "at-spi2-core", "bzip2", "cairo", "dbus", "expat", "fontconfig",
  "freetype", "fribidi", "gdk-pixbuf", "glib", "graphene", "harfbuzz",
  "libX11", "libXau", "libXcb", "libXcomposite", "libXcursor",
  "libXdamage", "libXdmcp", "libXext", "libXfixes", "libXi",
  "libXinerama", "libXrandr", "libXrender", "libXtst", "libdrm",
  "libepoxy", "libffi", "libglvnd", "libiconv", "libjpeg", "libpng",
  "libtiff", "libxkbcommon", "libxml2", "pango", "pcre2", "pixman", "shared-mime-info",
  "toolchain", "wayland", "xz", "zlib", "zstd",
];

// All deps that provide shared libs — used for LD_LIBRARY_PATH and rpath-link.
const libDepNames = [
  "glib", "pango", "cairo", "gdk-pixbuf", "libepoxy", "graphene",
  "at-spi2-core", "dbus", "harfbuzz", "fontconfig", "freetype",
  "fribidi", "libpng", "pixman", "zlib", "expat", "bzip2", "libffi",
  "pcre2", "libX11", "libXext", "libXrender", "libXi", "libXrandr",
  "libXcursor", "libXinerama", "libXdamage", "libXcomposite",
  "libXfixes", "libXau", "libXcb", "libXdmcp", "libxml2", "libiconv",
  "xz", "libXtst", "wayland", "libdrm", "libjpeg", "libtiff", "zstd",
];

// Generate LD_LIBRARY_PATH from lib deps
const ldLibraryPath = libDepNames.map((d) => `/deps/${d}/lib`).join(":");

// Generate rpath-link flags from lib deps
const rpathLinkFlags = libDepNames.map((d) => `-Wl,-rpath-link,/deps/${d}/lib`).join(" \\\n  ");

const recipe = await shellBuild({
  ...mesonProfile({
    cxx: true,
    python: "python",
    binDeps: ["glib", "gdk-pixbuf", "shared-mime-info"],
    includeDeps: [
      "glib", "pango", "cairo", "gdk-pixbuf", "libepoxy", "graphene",
      "at-spi2-core", "dbus",
      "harfbuzz", "fontconfig", "freetype", "fribidi", "libpng", "pixman",
      "zlib", "expat", "bzip2", "libffi", "pcre2",
      "libX11", "libXext", "libXrender", "libXi", "libXrandr",
      "libXcursor", "libXinerama", "libXdamage", "libXcomposite",
      "libXfixes", "libXau", "libXcb", "libXdmcp", "xorgproto",
      "libxml2", "libiconv", "xz", "libXtst", "wayland",
      "libxkbcommon", "libdrm", "libglvnd", "libjpeg", "libtiff", "zstd",
    ],
    includePaths: ["/deps/freetype/include/freetype2"],
    libDeps: [
      "glib", "pango", "cairo", "gdk-pixbuf", "libepoxy", "graphene",
      "at-spi2-core", "dbus",
      "harfbuzz", "fontconfig", "freetype", "fribidi", "libpng", "pixman",
      "zlib", "expat", "bzip2", "libffi", "pcre2",
      "libX11", "libXext", "libXrender", "libXi", "libXrandr",
      "libXcursor", "libXinerama", "libXdamage", "libXcomposite",
      "libXfixes", "libXau", "libXcb", "libXdmcp",
      "libxml2", "libiconv", "xz", "libXtst", "wayland",
      "libxkbcommon", "libdrm", "libglvnd", "libjpeg", "libtiff", "zstd",
    ],
    pkgConfigDeps: [
      "glib", "pango", "cairo", "gdk-pixbuf", "libepoxy", "graphene",
      "at-spi2-core", "dbus",
      "harfbuzz", "fontconfig", "freetype", "fribidi", "libpng", "pixman",
      "zlib", "expat", "bzip2", "libffi", "pcre2",
      "libX11", "libXext", "libXrender", "libXi", "libXrandr",
      "libXcursor", "libXinerama", "libXdamage", "libXcomposite",
      "libXfixes", "libXau", "libXcb", "libXdmcp",
      "libxml2", "libXtst", "xz", "wayland", "wayland-protocols",
      "libxkbcommon", "libdrm", "libglvnd", "libjpeg", "libtiff", "zstd",
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
# Pre-generate profile_conf.h and patch meson.build to avoid the
# capture: true custom_target that triggers meson --internal exe.
mkdir -p build
printf '/* Auto-generated. */\n#pragma once\n#define PROFILE "default"\n#define VCS_TAG ""\n' > build/profile_conf.h

# Patch meson.build to replace profile_conf custom_target with static file
/deps/python/bin/python3 -c "
content = open('meson.build').read()
old = '''profile_conf_h = declare_dependency(
  sources: custom_target('profile-conf',
    command: [gen_profile_conf, meson.project_source_root(), profile],
    capture: true,
    output: 'profile_conf.h',
    build_by_default: true,
    build_always_stale: true,
  )
)'''
new = '''profile_conf_h = declare_dependency(
  sources: files('build/profile_conf.h'),
)'''
content = content.replace(old, new)
open('meson.build', 'w').write(content)
"

# C++ compiler — GTK4 has C++ code
export CXXFLAGS="-O2 -I/deps/freetype/include/freetype2"

# Ensure shared libs can be found by meson's cc.run() checks and at link time
export LD_LIBRARY_PATH="${ldLibraryPath}\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}"

export LDFLAGS="$HOD_DUMMY_RPATH \\
  ${rpathLinkFlags}"

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Ddefault_library=shared \\
  -Dx11-backend=true \\
  -Dwayland-backend=true \\
  -Dbroadway-backend=false \\
  -Dvulkan=disabled \\
  -Dmedia-gstreamer=disabled \\
  -Dintrospection=disabled \\
  -Dbuild-demos=false \\
  -Dbuild-tests=false \\
  -Dbuild-testsuite=false \\
  -Dbuild-examples=false \\
  -Dprint-cpdb=disabled \\
  -Dprint-cups=disabled \\
  -Dcloudproviders=disabled \\
  -Dcolord=disabled \\
  -Dsysprof=disabled \\
  -Dtracker=disabled \\
  -Df16c=disabled \\
  -Daccesskit=disabled \\
  -Ddocumentation=false \\
  -Dman-pages=false

ninja -C build
DESTDIR=$OUT ninja -C build install

${RELOCATE_PKG_CONFIG}

# Compile GSettings schemas — GTK4 ships org.gtk.gtk4.Settings.FileChooser etc.
# Downstream apps (nautilus) call g_settings_new() which requires compiled schemas.
if [ -d "$OUT/share/glib-2.0/schemas" ] && ls "$OUT/share/glib-2.0/schemas/"*.gschema.xml >/dev/null 2>&1; then
  /deps/glib/bin/glib-compile-schemas $OUT/share/glib-2.0/schemas
fi

${STRIP_ALL}
`,
  deps: [
    dep("source", gtk4SourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
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
    dep("wayland", waylandRecipe),
    dep("wayland-protocols", waylandProtocolsRecipe),
    dep("libxkbcommon", libxkbcommonRecipe),
    dep("libjpeg", libjpegRecipe),
    dep("libtiff", libtiffRecipe),
    dep("zstd", zstdRecipe),
    dep("libdrm", libdrmRecipe),
    dep("libglvnd", libglvndRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: gtk4RuntimeDeps,
});

await importToStore(recipe);
export const gtk4Recipe = recipe;
